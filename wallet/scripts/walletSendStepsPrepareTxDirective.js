/**
  Directive to manage the wallet send flows
  - Parent Controller is from the walletSendManagerDirective
 */
angular.module('BitGo.Wallet.WalletSendStepsPrepareTxDirective', [])

.directive('walletSendStepsPrepareTx', ['$q', '$rootScope', 'NotifyService', 'CacheService', 'UtilityService', 'BG_DEV', 'LabelsAPI',
  function($q, $rootScope, NotifyService, CacheService, UtilityService, BG_DEV, LabelsAPI) {

    return {
      restrict: 'A',
      require: '^walletSendManager', // explicitly require it
      controller: ['$scope', function($scope) {
        $scope.gatheringUnspents = false;

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

        // Validate the transaciton input form
        function txIsValid() {
          var balance;
          var currentWallet;
          var currentWalletAddress;
          var validRecipientAddress;

          try {
            // Wallet checking
            validRecipientAddress = Bitcoin.Address.validate($scope.transaction.recipientAddress);
            currentWallet = $rootScope.wallets.current;
            currentWalletAddress = currentWallet.data.id;
            // Funds checking
            balance = currentWallet.data.balance;
          } catch(error) {
            // TODO (Gavin): show user an error here? What can they do?
            console.error('There was an issue preparing the transaction: ', error.message);
          }

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
          // Create the scope's pending transaction
          return $scope.createPendingTransaction(sender, recipient)
          .then(function() {
            saveLabel();
          });
        }

        // advances the transaction state if the for and inputs are valid
        $scope.advanceTransaction = function(amountSpendWasReduced) {
          // amountSpendWasReduced is used to repesent how much lower the total
          // amount the user can send is if they are trying to send an amount
          // that is larger than for which they can afford the blockchain fees.
          // i.e., if they try to spend their full balance, this will be
          // automatically reduced by amountSpendWasReduced to an amount they
          // can afford to spend. This variable must be scoped to the
          // advanceTransaction method so that every time they click the "next"
          // button it gets reset to undefined, in case they blick back and
          // next over and over changing the total amount, ensuring that it
          // gets recomputed each time.
          $scope.transaction.amountSpendWasReduced = amountSpendWasReduced;

          $scope.gatheringUnspents = true;

          $scope.clearFormError();
          if (txIsValid()) {
            return prepareTx()
            .then(function() {
              $scope.gatheringUnspents = false;
              $scope.setState('confirmAndSendTx');
            })
            .catch(function(error) {
              $scope.gatheringUnspents = false;
              if (error == 'Error: Insufficient funds') {
                // An insufficient funds error might happen for a few reasons.
                // The user might spending way more money than they have, in
                // which case this is an actual error. Or an insufficient funds
                // error might occur if they are spending the same or slightly
                // less than their total balance, and they don't have enough
                // money to pay the balance. If the former, throw an error, if
                // the latter, we try to handle it specially, explained below.
                if (typeof error.fee === 'undefined' || error.fee >= $scope.transaction.amount) {
                  NotifyService.error('You do not have enough funds in your wallet to pay for the blockchain fees for this transaction.');
                } else {
                  // If the user is trying to spend a large amount and they
                  // don't quite have enough funds to pay the fees, then we
                  // automatically subtract the fee from the amount they are
                  // sending and try again. In order to prevent a possible
                  // infinite loop if this still isn't good enough, we keep
                  // track of whether we have already tried this, and if we
                  // have, we throw an error. Furthermore, we create an
                  // automaticallySubtractinFee variable so that the client can
                  // optionally display a warning if desired.
                  if (!amountSpendWasReduced) {
                    amountSpendWasReduced = $scope.transaction.amount - (error.available - error.fee);
                    $scope.transaction.amount = error.available - error.fee;
                    $scope.advanceTransaction(amountSpendWasReduced);
                  } else {
                    NotifyService.error('You do not have enough funds in your wallet to pay for the blockchain fees for this transaction.');
                  }
                }
              } else {
                Raven.captureException(error, { tags: { loc: 'ciaffxsd00000wc52djlzz2tp' } });
                NotifyService.error('Your transaction was unable to be processed. Please ensure it does not violate any policies, then refresh your page and try sending again.');
              }
            });
          }

          // The result of this function is only ever checked in tests.
          // However, rather than return false, it is good practice to return a
          // promise, since this function is asynchronous, and thus should
          // always return a promise.
          return $q(function(resolve, reject) {
            return resolve(false);
          });
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
