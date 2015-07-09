angular.module('BitGo.API.UserAPI', ['ngResource'])

.factory('UserAPI', ['$location', '$q', '$resource', '$rootScope', 'UserModel', 'UtilityService', 'SDK', 'CacheService', 'AnalyticsProxy', 'BG_DEV',
  function($location, $q, $resource, $rootScope, UserModel, UtilityService, SDK, CacheService, AnalyticsProxy, BG_DEV) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    // Cache setup
    var tokenCache = new CacheService.Cache('sessionStorage', 'Tokens');
    // flag which is set for every user when they login. It tracks whether an email has been sent out for verification
    // incase the user has an unverified email
    var emailVerificationCache = new CacheService.Cache('sessionStorage', 'emailVerification');
    var userCache = new CacheService.Cache('localStorage', 'Users', 60 * 60 * 1000);

    var currentUser;

    function setPlaceholderUser() {
      currentUser = $rootScope.currentUser = new UserModel.PlaceholderUser();
    }

    function assertAuth(data) {
      console.assert(_.has(data, 'token_type'), "missing token_type");
      console.assert(_.has(data, 'access_token'), "missing access_token");
      console.assert(_.has(data, 'expires_in'), "missing expires_in");
    }

    /**
      * asserts if received data has necessary properties required for fetching other users
      * @param {object} The data received from the server when fetching another user
      */
    function assertGeneralBitgoUserProperties(data) {
      console.assert(_.has(data, 'user'), "missing user");
      console.assert(_.has(data.user, 'id'), "missing user.id");
      console.assert(_.has(data.user, 'name'), "missing user.name");
      console.assert(_.has(data.user.name, 'full'), "missing user.name.full");
      console.assert(_.has(data.user, 'email'), "missing user.email");
      console.assert(_.has(data.user.email, 'email'), "missing user.email.email");
    }

    /**
      * asserts if received data has necessary properties required for the main user
      * @param {object} The data received from the server for the main user
      */
    function assertCurrentUserProperties(data) {
      console.assert(_.has(data, 'user'), "missing user");
      console.assert(_.has(data.user, 'id'), "missing user.id");
      console.assert(_.has(data.user, 'username'), "missing user.username");
      console.assert(_.has(data.user, 'name'), "missing user.name");
      console.assert(_.has(data.user, 'email'), "missing user.email");
      console.assert(_.has(data.user.email, 'email'), "missing user.email.email");
      console.assert(_.has(data.user.email, 'verified'), "missing user.email.verified");
      console.assert(_.has(data.user, 'phone'), "missing user.phone");
      console.assert(_.has(data.user.phone, 'phone'), "missing user.phone.phone");
      console.assert(_.has(data.user.phone, 'verified'), "missing user.phone.verified");
      console.assert(_.has(data.user, 'isActive'), "missing user.isActive");
    }

    function setAuthToken(token) {
      tokenCache.add('token', token);
    }
    // sets the 'canSend' email flag for a user, intitally on login
    function setEmailVerificationToken(data) {
      emailVerificationCache.add('canSend', data);
    }

    function clearAuthToken() {
      tokenCache.remove('token');
    }

    function clearEmailVerificationToken() {
      emailVerificationCache.remove('canSend');
    }

    function setCurrentUser(user) {
      if (user) {
        // Set up the app's user
        currentUser = $rootScope.currentUser = new UserModel.User(true, user);
        Raven.setUser({id: currentUser.settings.id});
        // Emit signal to set initial app state for the user
        $rootScope.$emit('UserAPI.CurrentUserSet');
      } else {
        // Remove the app's user
        setPlaceholderUser();
        $rootScope.$emit('UserAPI.PlaceholderUserSet');
      }
    }

    /**
    * Remove any current user data
    * @private
    */
    function clearCurrentUser() {
      SDK.delete();
      if (currentUser.loggedIn) {
        clearAuthToken();
        clearEmailVerificationToken();
        Raven.setUser();
        setCurrentUser();
      }
    }

    // Initialize the factory
    function init() {
      setPlaceholderUser();
    }
    init();

    // In-client API
    return {
      init: function() {
        var self = this;
        var deferred = $q.defer();
        // If we have a token stored, then we should be able to use the API
        // already.  Attempt to get the current user.
        if (tokenCache.get('token')) {
          return self.me()
          .then(function(user) {
            return currentUser;
          });
        } else {
          deferred.reject("no token");
        }
        return deferred.promise;
      },
      me: function() {
        var resource = $resource(kApiServer + '/user/me', {});
        return resource.get({}).$promise
        .then(
          function(data) {
            assertCurrentUserProperties(data);
            setCurrentUser(data.user);
            return currentUser;
          },
          PromiseErrorHelper()
        );
      },
      // Get a BitGo user (not the app's main user)
      get: function(userId, useCache) {
        if (!userId) {
          throw new Error('Need userId when getting a user\'s info');
        }
        // If using cache, check it first
        if (useCache) {
          var cacheUser = userCache.get(userId);
          if (cacheUser) {
            return $q.when(cacheUser);
          }
        }
        // Otherwise perform the fetch and add the user to the cache
        var resource = $resource(kApiServer + '/user/' + userId, {});
        return resource.get({}).$promise
        .then(
          function(data) {
            assertGeneralBitgoUserProperties(data);
            var decoratedUser = new UserModel.User(false, data.user);
            userCache.add(userId, decoratedUser);
            return decoratedUser;
          },
          PromiseErrorHelper()
        );
      },
      // Log the user in
      login: function(params) {
        // Wipe an existing user's token if a new user signs
        // in without logging out of the current user's account
        clearCurrentUser();
        if (currentUser.loggedIn) {
          // logout user so that it clears up wallets and enterprises on scope
          $rootScope.$emit('UserAPI.UserLogoutEvent');
        }

        // Flag for the new client - need email to be verified first
        params.isNewClient = true;

        return $q.when(SDK.get().authenticate({
          username: params.email,
          password: params.password,
          otp: params.otp
        }))
        .then(
          function(data) {
            // be sure to save the sdk to cache so that we aren't logged out
            // upon browser refresh
            SDK.save();

            assertAuth(data);
            assertCurrentUserProperties(data);
            setAuthToken(data.access_token);

            // By default 'canSendEmail' is set to true
            setEmailVerificationToken(true);
            setCurrentUser(data.user);

            // Mixpanel Tracking
            var trackingData = {
              userID: data.user.id
            };
            AnalyticsProxy.loginUser(trackingData.userID);
            // Note: this data is sent w/ all future track calls while this person uses BitGo
            AnalyticsProxy.sendWithAllTrackingEvents(trackingData);
            // Track the successful login
            AnalyticsProxy.track('Login');

            return currentUser;
          },
          PromiseErrorHelper()
        );
      },
      signup: function(params) {
        // Wipe an existing user's token if a new user signs
        // up without logging out of the current user's account
        clearCurrentUser();

        // TODO: Add support for signup in the SDK
        var resource = $resource(kApiServer + '/user/signup');
        return new resource(params).$save({})
        .then(
          function(data) {
            // Mixpanel Tracking
            AnalyticsProxy.registerUser(data.user.userID);
            // Track the successful signup
            AnalyticsProxy.track('Signup');

            return data.user;
          },
          PromiseErrorHelper()
        );
      },
      getUserEncryptedData: function() {
        var Resource = $resource(kApiServer + '/user/encrypted', {}, {
          post: { method: 'POST' }
        });
        var getEncrypted = new Resource();
        return getEncrypted.$post()
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      resetPassword: function(params) {
        if (!params || !params.password || !params.email) {
          throw new Error('Invalid params');
        }
        var Resource = $resource(kApiServer + '/user/resetpassword', {}, {
          post: { method: 'POST' }
        });
        var reset = new Resource(params);
        return reset.$post()
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      verifyPassword: function(params) {
        if (!params.password) {
          throw new Error('Expect a password to verify');
        }
        var resource = $resource(kApiServer + '/user/verifypassword', {}, {
          post: { method: 'POST' }
        });
        return new resource(params).$post()
        .then(
          function(data) {
            if (!data.valid) {
              // If invalid, return a needs passcode error
              var error = new UtilityService.ErrorHelper({
                status: 401,
                data: { needsPasscode: true },
                message: 'invalidPassword'
              });
              return $q.reject(error);
            }
            return data.valid;
          },
          PromiseErrorHelper()
        );
      },
      changePassword: function(params) {
        if (!params.password) {
          throw new Error('Expect a new password');
        }
        if (!params.oldPassword) {
          throw new Error('Expect the current password');
        }
        if (!params.version) {
          throw new Error('Expect current version');
        }
        if (!params.keychains) {
          throw new Error('Expect keychains');
        }

        var resource = $resource(kApiServer + '/user/changepassword', {}, {
          post: { method: 'POST' }
        });
        return new resource(params).$post()
        .then(
          function(data) {
            return data;
          },
          PromiseErrorHelper()
        );
      },
      logout: function() {
        $rootScope.$emit('UserAPI.UserLogoutEvent');

        // Regardless of success or fail, we want to clear user data
        return $q.when(SDK.get().logout({}))
        .then(
          function(result) {
            // Track the successful logout
            AnalyticsProxy.track('Logout');
            AnalyticsProxy.shutdown();

            // clearing the SDK cache upon logout to make sure the user doesn't
            // stay logged in.
            clearCurrentUser();
            return result;
          },
          function(error) {
            // Track the failed logout
            var metricsData = {
              // Error Specific Data
              status: error.status,
              message: error.error,
              action: 'Logout'
            };
            AnalyticsProxy.track('Error', metricsData);
            AnalyticsProxy.shutdown();

            // even upon a failed logout, we still want to clear the SDK from
            // cache to make sure the user doesn't somehow stay logged in.
            clearCurrentUser();
            $location.path('/login');
            return error;
          }
        );
      },
      endSession: function() {
        // emit a message so that all wallets/walletshares can be cleared out
        $rootScope.$emit('UserAPI.UserLogoutEvent');

        // Track the successful logout
        AnalyticsProxy.track('Logout');
        AnalyticsProxy.shutdown();

        clearCurrentUser();
        $location.path('/login');
      },
      // TODO(ben): add lock API when needed
      unlock: function(params) {
        var resource = $resource(kApiServer + '/user/unlock', {},
          { post: { method: 'POST' } });
        var unlockRequest = new resource(params);
        return unlockRequest.$post({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      session: function(params) {
        var resource = $resource(kApiServer + '/user/session', {});
        return resource.get({}).$promise
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      create: function(params) {
        var Resource = $resource(kApiServer + '/user/create', {},
                { post: { method: 'POST' } });
        var createRequest = new Resource(params);
        return createRequest.$post({})
        .then(
          function(data) {
            assertAuth(data);
            assertCurrentUserProperties(data);
            return data.user;
          },
          PromiseErrorHelper()
        );
      },
      invite: function(params) {
        var inviteRequest;
        if (params.type == 'local') {
          var LocalResource = $resource(kApiServer + '/user/invite', {},
                  { post: { method: 'POST' } });
          inviteRequest = new LocalResource(params);
        }
        return inviteRequest.$post({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      sendOTP: function(params, onSuccess, onError) {
        var resource = $resource(kApiServer + '/user/sendotp', {}, {
          post: { method: 'POST' }
        });
        return new resource(params).$post({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      verify: function(parameters) {
        var VALID_TYPES = ['phone', 'email', 'forgotpassword'];
        var type;
        if(parameters){
          type=parameters.type;
        }
        var verifyUrl = '';

        if (!type || (type && (_.indexOf(VALID_TYPES, type) === -1))) {
          throw new Error('Verify expects a valid verification type');
        }

        switch(parameters.type) {
          case 'phone':
            verifyUrl = '/user/verifyphone';
            break;
          case 'email':
            verifyUrl = '/user/verifyemail';
            break;
          case 'forgotpassword':
            verifyUrl = '/user/verifyforgotpassword';
            break;
        }
        var resource = $resource(kApiServer + verifyUrl, parameters);
        return resource.get({}).$promise
        .then(
          function(data) {
            assertCurrentUserProperties(data);
            return data.user;
          },
          PromiseErrorHelper()
        );
      },
      request: function(params) {
        // Flag for the new client - need email link to be to new client
        // TODO: remove once migrated
        params.isNewClient = true;

        var resource = $resource(kApiServer + "/user/requestverification");
        return new resource(params).$save({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      forgotpassword: function(params) {
        var resource = $resource(kApiServer + "/user/forgotpassword");
        return new resource(params).$save({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      sharingkey: function(params){
        if (!params.email) {
          throw new Error('Expect email of person to share');
        }
        var resource = $resource(kApiServer + "/user/sharingkey");
        return new resource(params).$save({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
       );
      },
      deactivate: function(params) {
        var resource = $resource(kApiServer + "/user/deactivate", {},
                { post: { method: 'POST' } });
        var createRequest =  new resource(params);
        
        return createRequest.$post({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      payment: function(paymentParams, subscriptionsParams) {
        if (!paymentParams.token || !subscriptionsParams.planId) {
          throw new Error('Invalid parameters for payment');
        }
        var resource = $resource(kApiServer + "/user/payments");
        return new resource(paymentParams).$save({})
        .then(function(data) {
          var resource = $resource(kApiServer + "/user/subscriptions");
          return new resource(subscriptionsParams).$save({});
        })
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      changeSubscription: function(params, subscriptionId) {
        if (!params.planId || !subscriptionId) {
          throw new Error('Invalid parameters to change subscription');
        }
        var resource = $resource(kApiServer + "/user/subscriptions/" + subscriptionId, {}, {
          update: { method: 'PUT' }
        });
        return new resource(params).$update({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      deleteSubscription: function(subscriptionId) {
        if (!subscriptionId) {
          throw new Error('Invalid parameters to change subscription');
        }
        var resource = $resource(kApiServer + '/user/subscriptions/' + subscriptionId, {});
        return new resource({}).$delete()
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      }
    };
  }
]);
