/**
  Directive to manage the wallet send flows
  - Parent Controller is from the walletSendManagerDirective
 */
angular.module('BitGo.Wallet.WalletSendStepsPrepareTxDirective', [])

.directive('walletSendStepsPrepareTx', ['$rootScope', 'NotifyService', 'CacheService', 'UtilityService', 'BG_DEV', 'LabelsAPI',
  function($rootScope, NotifyService, CacheService, UtilityService, BG_DEV, LabelsAPI) {
    return {
      restrict: 'A',
      require: '^walletSendManager', // explicitly require it
      controller: ['$scope', function($scope) {
        // form error constants
        var ERRORS = {
          invalidRecipient: {
            type: 'invalidRecipient',
            msg: 'Please enter a valid recipient.'
          },
          sendToSelf: {
            type: 'sendToSelf',
            msg: 'You cannot send to yourself.'
          },
          invalidAmount: {
            type: 'invalidAmount',
            msg: 'Please enter a valid amount.'
          },
          insufficientFunds: {
            type: 'insufficientFunds',
            msg: 'You do not have sufficient funds to complete this transaction.'
          },
          amountTooSmall: {
            type: 'amountTooSmall',
            msg: 'This transaction amount is too small to send.'
          }
        };

        // shows the labeling field for the recipient address if it was manually
        // entered by the user
        $scope.showRecipientLabelField = function() {
          return $scope.transaction.recipientAddress && !$scope.transaction.recipientWallet;
        };

        // flag to let user know if they're violating the wallet spending limit
        $scope.violatesSpendingLimit = function() {
          var violatesTxLimit;
          var violatesDailyLimit;
          var amount = $scope.transaction.amount;
          try {
            violatesTxLimit = $rootScope.wallets.current.checkPolicyViolation(BG_DEV.WALLET.BITGO_POLICY_IDS["com.bitgo.limit.tx"], amount);
            violatesDailyLimit = $rootScope.wallets.current.checkPolicyViolation(BG_DEV.WALLET.BITGO_POLICY_IDS["com.bitgo.limit.day"], amount);
            return violatesTxLimit || violatesDailyLimit;
          } catch(error) {
            console.log('Missing $rootScope.wallets.current: ', error);
            return false;
          }
        };

        // If the user enters a new label, we add the new label to their
        // labels so they can find it by label next time they send
        function saveLabel() {
          if ($scope.transaction.recipientLabel) {
            var fromWallet = $rootScope.wallets.current;
            var validBtcAddress = Bitcoin.Address.validate($scope.transaction.recipientAddress);
            if (validBtcAddress) {
              var params = {
                walletId: fromWallet.data.id,
                label: $scope.transaction.recipientLabel,
                address: $scope.transaction.recipientAddress
              };
              LabelsAPI.add(params)
              .then(
                function(data) {},
                function(error) {
                  console.log('Error when saving label for an address: ', error);
                }
              );
            }
          }
        }

        /**
        * Return the total satoshi amount for the transaction
        * @private
        * @returns {Int} Tx total BTC amount
        */
        function txTotalSatoshis() {
          return parseFloat($scope.transaction.blockchainFee) +
            parseFloat($scope.transaction.bitgoFee) +
            parseFloat($scope.transaction.amount);
        }

        // Validate the transaciton input form
        function txIsValid() {
          var balance;
          var currentWallet;
          var currentWalletAddress;
          var fundsRemaining;
          var satoshisNeeded;
          var validRecipientAddress;

          try {
            // Wallet checking
            validRecipientAddress = Bitcoin.Address.validate($scope.transaction.recipientAddress);
            currentWallet = $rootScope.wallets.current;
            currentWalletAddress = currentWallet.data.id;
            // Funds checking
            balance = currentWallet.data.balance;
            satoshisNeeded = txTotalSatoshis();
            fundsRemaining = balance - satoshisNeeded;
          } catch(error) {
            // TODO (Gavin): show user an error here? What can they do?
            console.error('There was an issue preparing the transaction: ', error.message);
          }
          // set/update the transaction's total
          $scope.transaction.total = satoshisNeeded;

          // ensure a valid recipient address
          if (!validRecipientAddress) {
            $scope.setFormError(ERRORS.invalidRecipient.msg);
            return false;
          }
          // ensure they're not sending coins to this wallet's address
          if ($scope.transaction.recipientAddress === currentWalletAddress) {
            $scope.setFormError(ERRORS.sendToSelf.msg);
            return false;
          }
          // ensure a valid amount
          if (!parseFloat($scope.transaction.amount)) {
            $scope.setFormError(ERRORS.invalidAmount.msg);
            return false;
          }
          // ensure sufficient funds
          if (fundsRemaining + $scope.transaction.blockchainFee < 0) {
            $scope.setFormError(ERRORS.insufficientFunds.msg);
            return false;
          }
          // If they do have enough, but they're sending the total amount in their account,
          // automatically decrease the amount being sent by the blockchain 'required' fee,
          // then inform them that we deducted this amount and provide a reason why.
          if (fundsRemaining < 0) {
            // update the transaction amount being sent to the recipient
            $scope.transaction.amount = $scope.transaction.amount + fundsRemaining;
            // update the transaction total to account for the overdraft
            $scope.transaction.total = satoshisNeeded + fundsRemaining;
            $scope.showFeeAlert = true;
          }
          // ensure amount is greater than the minimum dust value
          if ($scope.transaction.amount <= BG_DEV.TX.MINIMUM_BTC_DUST) {
            $scope.setFormError(ERRORS.amountTooSmall.msg);
            return false;
          }
          return true;
        }

        function prepareTx() {
          // Set up objects for the TransactionAPI
          var sender = {
            wallet: $rootScope.wallets.current,
            otp: $scope.transaction.otp || '',
            passcode: $scope.transaction.passcode || '',
            message: $scope.transaction.message
          };
          var recipient = {
            type: $scope.transaction.recipientAddressType,
            address: $scope.transaction.recipientAddress,
            satoshis: parseFloat($scope.transaction.amount),
            message: $scope.transaction.message,
            suppressEmail: false
          };
          var fee = $scope.transaction.blockchainFee;
          // Create the scope's pending transaction
          $scope.createPendingTransaction(sender, recipient, fee);
          saveLabel();
        }

        // advances the transaction state if the for and inputs are valid
        $scope.advanceTransaction = function() {
          $scope.clearFormError();
          if (txIsValid()) {
            $scope.setState('confirmAndSendTx');
            return prepareTx();
          }
          return false;
        };

        function init() {
          if (!$scope.transaction) {
            throw new Error('Expect a transaction object when initializing');
          }
        }
        init();
      }]
    };
  }
]);
