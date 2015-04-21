/**
  Directive to manage the wallet send flows
  - Parent Controller is WalletController
 */
angular.module('BitGo.Wallet.WalletSendManagerDirective', [])

.directive('walletSendManager', ['$timeout', '$rootScope', '$location', 'NotifyService', 'CacheService', 'UtilityService', 'TransactionsAPI', 'BG_DEV',
  function($timeout, $rootScope, $location, NotifyService, CacheService, UtilityService, TransactionsAPI, BG_DEV) {
    return {
      restrict: 'A',
      require: '^WalletController',
      controller: ['$scope', function($scope) {
        // viewstates for the send flow
        $scope.viewStates = ['prepareTx', 'confirmAndSendTx'];
        // current view state
        $scope.state = null;
        // the transaction object built as the user goes through the send flow
        $scope.transaction = null;
        // The actual bitcoin transaction object that will be signed and
        // sent to the BitGo server for processing
        $scope.pendingTransaction = null;
        // flag to show notice if we had to automatically add a fee
        $scope.showFeeAlert = null;
        // Get a copy of the Currency cache to use locally when switching between
        // currencies in the form (used when we allow currency switching)
        var currencyCache = CacheService.getCache('Currency');

        // Cancel the transaction send flow
        $scope.cancelSend = function() {
          $scope.$emit('WalletSendManagerDirective.SendTxCancel');
        };

        // Called to reset the send flow's state and local tx object
        $scope.resetSendManager = function() {
          $scope.$broadcast('WalletSendManagerDirective.ResetState');
          // reset the local state
          setNewTxObject();
          $scope.setState('prepareTx');
        };

        // resets the local, working version of the tx object
        function setNewTxObject() {
          delete $scope.transaction;
          // properties we can expect on the transaction object
          $scope.transaction = {
            // tx fees
            blockchainFee: 0.0001 * 1e8,    // value is in Satoshis
            bitgoFee: 0.0,                  // value is in Satoshis
            // amount of the transaction
            amount: null,                   // value is in Satoshis
            // total transaction value with fees and amount included
            total: null,
            // time the transaction was confirmed (Shown in the ui on successful send)
            confirmationTime: '',
            // the otp code for sending the tx
            otp: '',
            // the passcode for the wallet
            passcode: '',
            // Label added to an address (optional)
            recipientLabel: '',
            // this property is set if a user selects a wallet from the dropdown
            // remains null otherwise (e.g. If a user only types in an address)
            recipientWallet: null,
            // the address to which bitcoins are being sent (can come from selecting
            // a wallet from the dropdown or typing it in manually)
            recipientAddress: null,
            recipientAddressType: 'bitcoin',
            // optional message for the tx
            message: null
          };
        }

        // Creates a new pending transaction to be confirmed and send to the BitGo server
        $scope.createPendingTransaction = function(sender, recipient, fee) {
          $scope.pendingTransaction = new TransactionsAPI.TransactionBuilder(sender, recipient, fee);
        };

        function init() {
          $rootScope.setContext('walletSend');

          $scope.state = 'prepareTx';
          $scope.showFeeAlert = false;
          setNewTxObject();
        }
        init();
      }]
    };
  }
]);
