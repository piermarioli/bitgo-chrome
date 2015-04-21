// Model for the App's Current User
angular.module('BitGo.Models.UserModel', [])

.factory('UserModel', ['$location', '$rootScope', 'BG_DEV',
  function($location, $rootScope, BG_DEV) {
    var defaultUserSettings = {
      id: null,
      currency: {
        currency: BG_DEV.CURRENCY.DEFAULTS.CURRENCY,
        bitcoinUnit: BG_DEV.CURRENCY.DEFAULTS.BITCOIN_UNIT,
      },
      email: { email: '', verified: false},
      phone: { phone: '', verified: false }
    };

    function User(loggedIn, settings) {
      this.settings = settings;
      // set to true when a user has a valid token
      this.loggedIn = loggedIn;
      // set to true when a user has a saved/verified phone
      this.hasAccess = this.checkAccess();
    }

    User.prototype.phoneNotSet = function() {
      if (!this.settings.phone || this.settings.phone.phone === '') {
        return true;
      }
      return false;
    };
    User.prototype.phoneNotVerified = function() {
      return !this.settings.phone.verified;
    };

    User.prototype.emailNotSet = function() {
      if (!this.settings.email || this.settings.email.email === '') {
        return true;
      }
      return false;
    };
    User.prototype.emailNotVerified = function() {
      return !this.settings.email.verified;
    };

    User.prototype.checkAccess = function() {
      // ensure they have a verified email first
      if (this.emailNotSet() || this.emailNotVerified()) {
        return false;
      }
      if (this.phoneNotSet() || this.phoneNotVerified()) {
        return false;
      }
      return true;
    };

    User.prototype.setProperty = function(properties) {
      var self = this;
      _.forIn(properties, function(value, prop) {
        if (!_.has(self, prop)) {
          throw new Error(BG_DEV.ERRORS.INVALID_ROOT_USER_PROP);
        }
        self[prop] = value;
      });
    };

    function PlaceholderUser() {
      return new User(false, defaultUserSettings);
    }

    return {
      User: User,
      PlaceholderUser: PlaceholderUser
    };
  }
]);
