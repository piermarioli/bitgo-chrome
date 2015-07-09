/*
  About:
  - The SettingsController deals with managing the section of the
  app where a user sets their personal info, notifications, settings, etc.

  Notes:
  - This manages: AboutForm, PhoneForm, CurrencyForm, PasswordForm, NotificationForm
*/
angular.module('BitGo.Settings.SettingsController', [])

.controller('SettingsController', ['$modal', '$rootScope', '$scope', '$q', 'SettingsAPI', 'UserAPI', 'UtilityService', 'InternalStateService', 'BG_DEV',
  function($modal, $rootScope, $scope, $q, SettingsAPI, UserAPI, Util, InternalStateService, BG_DEV) {
    // Possible view states (sections) for this controller
    $scope.viewStates = ['about', 'password', 'preferences', 'developers', 'plans'];
    // The initial view state; initialized later
    $scope.state = null;

    // initialize otp for settings updates
    $scope.otp = null;
    // verification otp is used when resetting the phone number (settings phone form)
    $scope.verificationOtp = null;

    // $scope.saveSettings is called from child directives. Returns a promise
    $scope.saveSettings = function(newSettings) {
      if (!newSettings) {
        throw new Error('invalid params');
      }
      return SettingsAPI.save(newSettings);
    };

    // $scope.savePhone is called from child directives. Returns a promise
    $scope.savePhone = function(params) {
      if (!params) {
        throw new Error('invalid params');
      }
      return SettingsAPI.savePhone(params);
    };

    // Triggers otp modal to open if user needs to otp before changing settings
    $scope.openModal = function (size) {
      var modalInstance = $modal.open({
        templateUrl: 'modal/templates/modalcontainer.html',
        controller: 'ModalController',
        scope: $scope,
        size: size,
        resolve: {
          // The return value is passed to ModalController as 'locals'
          locals: function () {
            return {
              type: BG_DEV.MODAL_TYPES.otp,
              userAction: BG_DEV.MODAL_USER_ACTIONS.otp
            };
          }
        }
      });
      return modalInstance.result;
    };

    function onGetSettingsSuccess(settings) {
      // settings bound to the ui
      $scope.settings = settings;
      // copy for detecting changes
      $scope.localSettings = _.cloneDeep($scope.settings);
      // Update settings of user on rootscope
      $rootScope.currentUser.settings = $scope.settings;
      // let scopes below know about the new settings received
      $rootScope.$emit('SettingsController.HasNewSettings');
    }

    function onGetSettingsFail(error) {
      console.log('Error with user settings fetch: ', error);
    }

    $scope.getSettings = function() {
      SettingsAPI.get()
      .then(onGetSettingsSuccess)
      .catch(onGetSettingsFail);
    };

    /**
    * Let all substates (tabs) in the settings area know of state changes
    * @private
    */
    var killStateWatcher = $scope.$watch('state', function(state) {
      if (state) {
        $scope.$broadcast('SettingsController.StateChangesd', { newState: state });
      }
    });

    /**
    * Clean up all watchers when the scope is garbage collected
    * @private
    */
    $scope.$on('$destroy', function() {
      killStateWatcher();
    });

    function init() {
      $rootScope.setContext('accountSettings');

      $scope.getSettings();
      $scope.state = InternalStateService.getInitState($scope.viewStates) || 'about';
    }
    init();
  }
]);
