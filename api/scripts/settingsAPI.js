angular.module('BitGo.API.SettingsAPI', [])

.factory('SettingsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService',
  function($q, $location, $resource, $rootScope, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    function assertAuth(data) {
      console.assert(_.has(data, 'token_type'), "missing token_type");
      console.assert(_.has(data, 'access_token'), "missing access_token");
      console.assert(_.has(data, 'expires_in'), "missing expires_in");
    }

    function assertSettings(data) {
      console.assert(_.has(data, 'settings'), 'missing settings');
      console.assert(_.has(data.settings, 'username'), 'missing settings.username');
      console.assert(_.has(data.settings, 'name'), 'missing settings.name');
      console.assert(_.has(data.settings.name, 'full'), 'missing settings.name.full');
      console.assert(_.has(data.settings.name, 'first'), 'missing settings.name.first');
      console.assert(_.has(data.settings.name, 'last'), 'missing settings.name.last');
      console.assert(_.has(data.settings, 'email'), 'missing settings.email');
      console.assert(_.has(data.settings.email, 'email'), 'missing settings.email.email');
      console.assert(_.has(data.settings.email, 'verified'), 'missing settings.email.verified');
      console.assert(_.has(data.settings, 'phone'), 'missing settings.phone');
      console.assert(_.has(data.settings.phone, 'phone'), 'missing settings.phone.phone');
      console.assert(_.has(data.settings.phone, 'verified'), 'missing settings.phone.verified');
      console.assert(_.has(data.settings, 'notifications'), 'missing notifications');
      console.assert(_.has(data.settings, 'isPrivateProfile'), 'missing isPrivateProfile');
      console.assert(_.has(data.settings.notifications, 'via_email'), 'missing settings.notifications.via_email');
      console.assert(_.has(data.settings.notifications, 'via_phone'), 'missing settings.notifications.via_phone');
      console.assert(_.has(data.settings.notifications, 'on_send_btc'), 'missing settings.notifications.on_send_btc');
      console.assert(_.has(data.settings.notifications, 'on_recv_btc'), 'missing settings.notifications.on_recv_btc');
      console.assert(_.has(data.settings.notifications, 'on_message'), 'missing settings.notifications.on_message');
      console.assert(_.has(data.settings.notifications, 'on_btc_change'), 'missing settings.notifications.on_btc_change');
      console.assert(_.has(data.settings.notifications, 'on_follow'), 'missing settings.notifications.on_follow');
      console.assert(_.has(data.settings.notifications, 'on_join'), 'missing settings.notifications.on_join');
      console.assert(_.has(data.settings, 'digest'), 'missing digest');
      console.assert(_.has(data.settings.digest, 'enabled'), 'missing settings.digest.enabled');
      console.assert(_.has(data.settings.digest, 'intervalSeconds'), 'missing settings.digest.intervalSeconds');
    }

    // In-client API
    return {
      // Get all settings
      get: function() {
        var resource = $resource(kApiServer + "/user/settings", {});
        return resource.get({}).$promise
        .then(
          function(response) {
            assertSettings(response);
            return response.settings;
          },
          PromiseErrorHelper()
        );
      },
      // Set Specific User Settings
      save: function(params) {
        if (!params) {
          throw new Error('invalid params');
        }
        var resource = $resource(kApiServer + "/user/settings", {}, {
          'save': { method: 'PUT' }
        });
        return new resource(params).$save({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
      // Save a new phone number on the user
      savePhone: function(params) {
        if (!params) {
          throw new Error('invalid params');
        }
        var resource = $resource(kApiServer + "/user/settings/phone", {});
        return new resource(params).$save({})
        .then(
          PromiseSuccessHelper(),
          PromiseErrorHelper()
        );
      },
    };
  }
]);
