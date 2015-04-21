/**
 * Directive to manage the wallet create backup step and all of its possible choices
 * This
 */
angular.module('BitGo.Wallet.WalletCreateStepsBackupkeyDirective', [])

.directive('walletCreateStepsBackupkey', ['$rootScope', 'UtilityService', 'NotifyService', 'AnalyticsProxy',
  function($rootScope, Utils, NotifyService, AnalyticsProxy) {
    return {
      restrict: 'A',
      controller: ['$scope', function($scope) {
        // possible backupkey creation options
        var VALID_BACKUPKEY_OPTIONS = {
          inBrowser: {
            inBrowser: true,
            enabled: true
          },
          userProvided: {
            userProvided: true,
            enabled: true
          },
          coldKeyApp: {
            coldKeyApp: true,
            enabled: true
          }
        };
        // the currently selected backup key creation option
        $scope.option = null;

        // Checks if everything is valid before advancing the flow
        function isValidStep() {
          var isValid;
          switch ($scope.option) {
            case 'inBrowser':
              isValid = true;
              break;
            case 'userProvided':
              isValid = $scope.userXpubValid();
              break;
            // case 'coldKeyApp':
            //   break;
          }
          return isValid;
        }

        // If the user goes back to selecting the in-browser option,
        // clear the user-provided key info and the generated key info
        function clearBackupKeyInputs() {
          // Clear user key info
          $scope.inputs.useOwnBackupKey = false;
          $scope.inputs.backupPubKey = null;
          // Clear generated keychain info
          $scope.generated.backupKeychain = null;
          $scope.generated.backupKey = null;
        }

        // Attempts to generate a backup key from a user's provided xpub
        function generateBackupKeyFromXpub() {
          try {
            $scope.generated.backupKeychain = new Bitcoin.BIP32($scope.inputs.backupPubKey);
            var key = $scope.generated.backupKeychain.eckey;
            $scope.generated.backupKey = key;
          } catch(error) {
            return false;
          }
          return true;
        }

        // Determine if the user provided xpub is valid to in constructing
        // their wallet's backup keychain
        $scope.userXpubValid = function() {
          if (!$scope.inputs.backupPubKey || $scope.inputs.backupPubKey.length === 0) {
            return false;
          }
          return generateBackupKeyFromXpub();
        };

        // Disable backup key creation options on this scope
        function disableOptions(optsToDisable) {
          if (!optsToDisable) {
            throw new Error('Expect array of key creation options to disable');
          }
          _.forEach(optsToDisable, function(option) {
            if (_.has(VALID_BACKUPKEY_OPTIONS, option)) {
              VALID_BACKUPKEY_OPTIONS[option].enabled = false;
            }
          });
        }

        // set a backup key creation option
        $scope.setBackupkeyOption = function(option) {
          if (!option || !_.has(VALID_BACKUPKEY_OPTIONS, option)) {
            throw new Error('Expect a valid option when choosing a backup key option');
          }
          $scope.option = option;

          // Track the creation option selected
          var metricsData = {
            option: option
          };
          AnalyticsProxy.track('SelectBackupKeyOption', metricsData);

          // If the user chooses another backup key creation option,
          // clear the form data from the other (unselected) options
          if (option === 'inBrowser') {
            clearBackupKeyInputs();
          }
        };

        // Tells if the specific option is disabled based on the backup
        // key creation path selected
        $scope.optionIsDisabled = function(option) {
          if (_.has(VALID_BACKUPKEY_OPTIONS, option)) {
            return !VALID_BACKUPKEY_OPTIONS[option].enabled;
          }
          return false;
        };

        // UI - show/hide the backup key creation option
        $scope.showOption = function(option) {
          return $scope.option === option;
        };

        // advance the wallet creation flow
        // Note: this is called from the
        $scope.advanceBackupkey = function() {
          var metricsData;

          if (isValidStep()) {
            // track advancement from the backup key selection step
            metricsData = {
              option: $scope.option
            };
            AnalyticsProxy.track('SetBackupKey', metricsData);
            $scope.setState('passcode');
          } else {
            // track the failed advancement
            metricsData = {
              // Error Specific Data
              status: 'client',
              message: 'Invalid Backup Key xpub',
              action: 'SetBackupKey'
            };
            AnalyticsProxy.track('Error', metricsData);
          }
        };

        // Event handlers
        var killXpubWatcher = $scope.$watch('inputs.backupPubKey', function(xpub) {
          if (xpub && $scope.userXpubValid()) {

            // track the successful addition of a backup xpub
            AnalyticsProxy.track('ValidBackupXpubEntered');

            disableOptions(['inBrowser', 'coldKeyApp']);
            $scope.inputs.useOwnBackupKey = true;
          }
        });
        // Clean up the listeners on the scope
        $scope.$on('$destroy', function() {
          killXpubWatcher();
        });

        // Initialize the controller
        function init() {
          $scope.option = 'inBrowser';
        }
        init();
      }]
    };
  }
]);
