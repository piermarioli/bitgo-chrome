angular.module('BitGo.Settings.AboutFormDirective', [])

/**
 * Directive to manage the settings about form
 */
.directive('settingsAboutForm', ['$rootScope', 'UserAPI', 'UtilityService', 'NotifyService',
  function($rootScope, UserAPI, Util, Notify) {
    return {
      restrict: 'A',
      require: '^SettingsController',
      controller: ['$scope', function($scope) {
        var validate = Util.Validators;

        $scope.settings = $rootScope.currentUser.settings;

        function formIsValid() {
          if (!$scope.settings.name.full) {
            $scope.setFormError('Please enter a name.');
            return false;
          }
          return true;
        }

        function onSaveAboutSuccess(settings) {
          $scope.getSettings();
        }

        function onSaveAboutFail(error) {
          if (Util.API.isOtpError(error)) {
            $scope.openModal()
            .then(function(data) {
              if (data.type === 'otpsuccess') {
                $scope.saveAboutForm();
              }
            })
            .catch(unlockFail);
          } else {
            Notify.error(error.error);
          }
        }

        $scope.hasChanges = function() {
          if (!$scope.settings || !$scope.localSettings) {
            return false;
          }
          if (!_.isEqual($scope.localSettings.name, $scope.settings.name)) {
            return true;
          }
          if ($scope.localSettings.timezone !== $scope.settings.timezone) {
            return true;
          }
          return false;
        };

        /**
         *  Saves changes to the about form
         *  @private
         */
        $scope.saveAboutForm = function() {
          // clear any errors
          $scope.clearFormError();
          if (formIsValid()) {
            var newSettings = {
              otp: $scope.otp,
              settings: {
                name: {
                  full: $scope.settings.name.full
                },
                // cuts of GMT (offset) value from the string and stores only city.name
                timezone: $scope.settings.timezone
              }
            };
            $scope.saveSettings(newSettings)
            .then(onSaveAboutSuccess)
            .catch(onSaveAboutFail);
          }
        };

      }]
    };
  }
]);
