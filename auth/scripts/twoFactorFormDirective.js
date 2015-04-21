angular.module('BitGo.Auth.TwoFactorFormDirective', [])

/**
 * Directive to help with login otp code verification
 */
.directive('twoFactorForm', ['UserAPI', 'UtilityService', 'NotifyService', 'BG_DEV', 'AnalyticsProxy',
  function(UserAPI, Util, Notify, BG_DEV, AnalyticsProxy) {
    return {
      restrict: 'A',
      require: '^LoginController',
      controller: ['$scope', function($scope) {
        $scope.twoFactorMethods = ['authy', 'text'];
        $scope.twoFactorMethod = 'authy';

        /**
         * UI - verifies if a method is the currently selected Otp method
         * @public
         */
        $scope.isTwoFactorMethod = function(method) {
          return method === $scope.twoFactorMethod;
        };

        /**
         * UI - sets the current Otp method on the scope
         * @public
         */
        $scope.setTwoFactorMethod = function(method) {
          if (typeof(method) !== 'string') {
            throw new Error('invalid method');
          }
          $scope.twoFactorMethod = method;

          // Track the method selected
          var metricsData = {
            method: method
          };
          AnalyticsProxy.track('SelectOtpMethod', metricsData);
        };

        /**
         * Checks if the user has a verified email and phone before allowing login
         * @private
         */
        function userHasAccess() {
          if ($scope.user.emailNotVerified()) {
            $scope.$emit('SetState', 'needsEmailVerify');
            return false;
          }
          if ($scope.user.phoneNotSet()) {
            $scope.$emit('SetState', 'setPhone');
            return false;
          }
          if ($scope.user.phoneNotVerified()) {
            $scope.$emit('SetState', 'verifyPhone');
            return false;
          }
          return true;
        }

        function formIsValid() {
          return Util.Validators.otpOk($scope.otpCode);
        }

        /**
         * Handle successful phone verification from the BitGo service
         * @param user {Object}
         * @private
         */
        function onVerifySuccess(user) {
          // Track phone verification success
          AnalyticsProxy.track('VerifyPhone');

          if (userHasAccess()) {
            $scope.$emit('SignUserIn');
          }
        }

        /**
         * Handle failed phone verification from the BitGo service
         * @param error {Object}
         * @private
         */
        function onVerifyFail(error) {
          // Track the server verification fail
          var metricsData = {
            // Error Specific Data
            status: error.status,
            message: error.error,
            action: 'Verify Phone'
          };
          AnalyticsProxy.track('Error', metricsData);

          Notify.error('There was a problem verifying your phone.');
        }

        $scope.submitVerifyPhone = function() {
          // Clear any errors
          $scope.clearFormError();

          if (formIsValid()) {
            var params = {
              type: 'phone',
              phone: $scope.user.settings.phone.phone,
              code: $scope.otpCode
            };
            UserAPI.verify(params)
            .then(function() {
              return UserAPI.me();
            })
            .then(onVerifySuccess)
            .catch(onVerifyFail);
          } else {
            $scope.setFormError('Please enter a valid 7-digit code.');
          }
        };

        function onSubmitOTPSuccess() {
          // Track the OTP success
          AnalyticsProxy.track('Otp');

          if (userHasAccess()) {
            $scope.$emit('SignUserIn');
          }
        }

        function onSubmitOTPFail(error) {
          // Track the OTP fail
          var metricsData = {
            // Error Specific Data
            status: error.status,
            message: error.error,
            action: 'Otp Login'
          };
          AnalyticsProxy.track('Error', metricsData);

          Notify.error('The code provided was invalid.');
        }

        $scope.submitOTP = function() {
          // Clear any errors
          $scope.clearFormError();

          if (formIsValid()) {
            $scope.attemptLogin()
            .then(onSubmitOTPSuccess)
            .catch(onSubmitOTPFail);
          } else {
            $scope.setFormError('Please enter a valid 7-digit code.');
          }
        };

        function onResendSuccess() {
          Notify.success('Your code was sent.');
        }

        function onResendFail(error) {
          if (error.status === 401 && error.needsOTP) {
            // In this case, the user was hitting /login to force the SMS resend
            // (since it is protected). If this error case comes back, we assume
            // that the server successfully sent the code to the user
            Notify.success('Your code was sent.');
          } else {
            Notify.error('There was an issue resending your code. Please refresh your page and log in again.');
          }
        }

        $scope.resendOTP = function(forceSMS) {
          // Track the text resend
          AnalyticsProxy.track('ResendOtp');

          if ($scope.user.loggedIn) {
            // If there is a session user, they are verifying their phone
            // and we can use the sendOTP protected route
            var params = {
              forceSMS: !!forceSMS
            };
            UserAPI.sendOTP(params)
            .then(onResendSuccess)
            .catch(onResendFail);
          } else {
            // If there is no user, we have a user trying to otp to log in
            $scope.attemptLogin(forceSMS)
            .then(onResendSuccess)
            .catch(onResendFail);
          }
        };

      }]
    };
  }
]);
