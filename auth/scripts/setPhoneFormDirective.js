angular.module('BitGo.Auth.SetPhoneFormDirective', [])

/**
  Directive to help with login phone setting form
 */
.directive('setPhoneForm', ['UtilityService', 'SettingsAPI', 'UserAPI', 'NotifyService', 'BG_DEV', 'AnalyticsProxy',
  function(Util, SettingsAPI, UserAPI, Notify, BG_DEV, AnalyticsProxy) {
    return {
      restrict: 'A',
      require: '^LoginController',
      controller: ['$scope', function($scope) {
        function formIsValid() {
          return Util.Validators.phoneOk($scope.user.settings.phone.phone);
        }

        // Now request that an otp code be sent to the user's new (unverified) number
        function onSetPhoneSuccess(user) {
          // Track the phone set success
          AnalyticsProxy.track('SetPhone');

          var phone = $scope.user.settings.phone.phone;
          if (phone) {
            var params = {
              type: "phone"
            };
            UserAPI.request(params);
          }
          return $scope.$emit('SetState', 'verifyPhone');
        }

        /**
         * Handle server fail when setting phone on login
         * @param error {Object}
         * @private
         */
        function onSetPhoneFail(error) {
          Notify.error(error.error);

          // Track the phone set server fail
          var metricsData = {
            // Error Specific Data
            status: error.status,
            message: error.error,
            action: 'Set Phone'
          };
          AnalyticsProxy.track('Error', metricsData);
        }

        // Sets a new (unverified) phone number on the user
        // Note: as long as the phone number is not verified, we can set new phone
        // numbers on the user and sent otps to them -- but once verified, there
        // is an entirely different flow/route to change their phone number
        $scope.submitSetPhone = function() {
          // Clear any errors
          $scope.clearFormError();
          if (formIsValid()) {
            var data = {
              settings: { phone: { phone: $scope.user.settings.phone.phone } }
            };
            SettingsAPI.save(data)
            .then(onSetPhoneSuccess)
            .catch(onSetPhoneFail);
          } else {
            $scope.setFormError('Please add a valid phone numer.');

            // Track the phone set fail on the client
            var metricsData = {
              // Error Specific Data
              status: 'client',
              message: 'Invalid Phone Number',
              action: 'Set Phone'
            };
            AnalyticsProxy.track('Error', metricsData);
          }
        };
      }]
    };
  }
]);
