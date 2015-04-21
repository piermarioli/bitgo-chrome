angular.module('BitGo.Auth.LoginFormDirective', [])

/**
 * Directive to help with login form
 */
.directive('loginForm', ['UtilityService', 'NotifyService', 'RequiredActionService', 'BG_DEV', 'AnalyticsProxy',
  function(Util, Notify, RequiredActionService, BG_DEV, AnalyticsProxy) {
    return {
      restrict: 'A',
      require: '^LoginController',
      controller: ['$scope', function($scope) {

        /**
         * Sets the locked password on the scope to use in the future
         */
        function setLockedPassword() {
          $scope.lockedPassword = _.clone($scope.password);
          $scope.lockedEmail = _.clone($scope.user.settings.email.email);
        }

        // This is specifically for firefox and how it handles the form autofilling
        // when a user chose to "remember my password" the autofill doesn't trip the
        // angular form handlers, so we check manually at form submit time
        function fetchPreFilledFields() {
          if (!$scope.user.settings.email.email) {
            var email = $('[name=email]').val();
            if (email) {
              $scope.user.settings.email.email = Util.Formatters.email(email);
            }
          }
          if (!$scope.password) {
            var password = $('[name=password]').val();
            if (password) {
              $scope.password = password;
            }
          }
        }

        function formIsValid() {
          return (!!$scope.password && Util.Validators.emailOk($scope.user.settings.email.email));
        }

        /**
         * Checks if we need a user to upgrade a weak login password
         * @returns {Bool}
         * @private
         */
        function passwordUpgradeActionSet() {
          var action = BG_DEV.REQUIRED_ACTIONS.WEAK_PW;
          if (!$scope.passwordStrength) {
            return false;
          }
          if ($scope.passwordStrength.progress.value < BG_DEV.PASSWORD.MIN_STRENGTH) {
            RequiredActionService.setAction(action);
          } else {
            RequiredActionService.removeAction(action);
          }
          return true;
        }

        /**
        * Sets the scope's password strength object
        * @param passwordStrength {Object}
        * @public
        */
        $scope.checkStrength = function(passwordStrength) {
          $scope.passwordStrength = passwordStrength;
        };

        function onLoginSuccess(user) {
          if (user.emailNotVerified()) {
            return $scope.$emit('SetState', 'needsEmailVerify');
          }
          if (user.phoneNotSet()) {
            return $scope.$emit('SetState', 'setPhone');
          }
          if (user.phoneNotVerified()) {
            return $scope.$emit('SetState', 'verifyPhone');
          }
        }

        function onLoginFail(error) {
          if (error.needsOTP) {
            // Track the successful password verification
            // needsOTP failure means that the username / pw match was correct
            AnalyticsProxy.track('VerifyPassword');
            return $scope.$emit('SetState', 'otp');
          }
          // Track the password / username failure
          var metricsData = {
            // Error Specific Data
            status: error.status,
            message: error.error,
            action: 'Login'
          };
          AnalyticsProxy.track('Error', metricsData);
          Notify.error("Incorrect email or password.");
        }

        $scope.submitLogin = function() {
          // clear any errors
          $scope.clearFormError();
          fetchPreFilledFields();
          // handle the LastPass pw/email issues
          setLockedPassword();
          // check the login password strength for legacy weak pw's
          if (!passwordUpgradeActionSet()) {
            $scope.setFormError('There was an error confirming your password strength. Please reload your page and try again.');
            return;
          }
          // Submit the login form
          if (formIsValid()) {
            $scope.attemptLogin()
            .then(onLoginSuccess)
            .catch(onLoginFail);
          } else {
            // Track the failed auth
            var metricsData = {
              // Error Specific Data
              status: 'client',
              message: 'Invalid Login Form',
              action: 'Login'
            };
            AnalyticsProxy.track('Error', metricsData);
            $scope.setFormError('Missing required information.');
          }
        };

        function init() {
          $scope.passwordStrength = null;
        }
        init();
      }]
    };
  }
]);
