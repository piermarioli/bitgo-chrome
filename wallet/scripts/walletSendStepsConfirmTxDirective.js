/**
  Directive to manage the wallet send flows
  - Parent Controller is from the walletSendManagerDirective
 */
angular.module('BitGo.Wallet.WalletSendStepsConfirmTxDirective', [])

.directive('walletSendStepsConfirmTx', ['$filter', '$modal', '$timeout', '$rootScope', 'NotifyService', 'TransactionsAPI', 'UtilityService', 'WalletsAPI', 'BG_DEV', 'AnalyticsProxy',
  function($filter, $modal, $timeout, $rootScope, NotifyService, TransactionsAPI, UtilityService, WalletsAPI, BG_DEV, AnalyticsProxy) {
    return {
      restrict: 'A',
      require: '^walletSendManager', // explicitly require it
      controller: ['$scope', function($scope) {
        // Max wallet sync fetch retries allowed
        var MAX_WALLET_SYNC_FETCHES = 5;
        // count for wallet sync data fetches
        var syncCounter;

        // flag letting us know when the transaction has been sent
        $scope.transactionSent = null;
        // flag letting us know if the sent transaction needs admin approval
        $scope.transactionNeedsApproval = null;
        // the transaction data returned after successful tx submittal
        $scope.returnedTransaction = null;
        // state for the ui buttons to be diabled
        $scope.processing = null;

        // Resets all the local state on this scope
        function resetLocalState() {
          $scope.transactionSent = null;
          $scope.transactionNeedsApproval = null;
          clearReturnedTxData();
        }

        // Triggers otp modal to open if user needs to otp before sending a tx
        function openModal(params) {
          if (!params || !params.type) {
            throw new Error('Missing modal type');
          }
          var modalInstance = $modal.open({
            templateUrl: 'modal/templates/modalcontainer.html',
            controller: 'ModalController',
            scope: $scope,
            size: params.size,
            resolve: {
              // The return value is passed to ModalController as 'locals'
              locals: function () {
                return {
                  type: params.type,
                  wallet: $rootScope.wallets.current,
                  userAction: BG_DEV.MODAL_USER_ACTIONS.sendFunds
                };
              }
            }
          });
          return modalInstance.result;
        }

        function handleTxSendError(error) {
          if (UtilityService.API.isOtpError(error) || UtilityService.API.isUnlockError(error)) {
            // If the user needs to OTP, use the modal to unlock their account
            openModal({ type: BG_DEV.MODAL_TYPES.otpThenUnlock })
            .then(function(result) {
              if (result.type === 'otpThenUnlockSuccess') {
                // set the otp code on the transaction object before resubmitting it
                $scope.transaction.otp = result.data.otp;
                $scope.transaction.passcode = result.data.password;
                // resubmit the tx on window close
                $scope.sendTx();
              }
            })
            .catch(function(error) {
              $scope.processing = false;
            });
          } else if (UtilityService.API.isPasscodeError(error)) {
            openModal({ type: BG_DEV.MODAL_TYPES.passwordThenUnlock })
            .then(function(result) {
              if (result.type === 'otpThenUnlockSuccess') {
                if (!result.data.password) {
                  throw new Error('Missing login password');
                }
                $scope.transaction.passcode = result.data.password;
                // resubmit the tx on window close
                $scope.sendTx();
              }
            })
            .catch(function(error) {
              $scope.processing = false;
            });
          } else {
            $scope.processing = false;
            // Otherwise just display the error to the user
            if (error && error.error) {
              NotifyService.errorHandler(error);
              return;
            }
            NotifyService.error('Your transaction was unable to be processed. Please ensure it does not violate any policies, then refresh your page and try sending again.');
          }
        }

        /**
         * Fetch a wallet to sync it's balance/data with the latest data from the server
         * based on the user's recent action taken
         */
        function syncCurrentWallet() {
          if (syncCounter >= MAX_WALLET_SYNC_FETCHES) {
            return;
          }
          var params = {
            bitcoinAddress: $rootScope.wallets.current.data.id
          };
          WalletsAPI.getWallet(params, false).then(function(wallet) {
            // If the new balance hasn't been picked up yet on the backend, refetch
            // to sync up the client's data
            if (wallet.data.balance === $rootScope.wallets.current.data.balance) {
              syncCounter++;
              $timeout(function() {
                syncCurrentWallet();
              }, 2000);
              return;
            }
            // Since we possibly have a new pending approval
            // Since we have a new global balance on this enterprise
            // Fetch the latest wallet data
            // (this will also update the $rootScope.currentWallet)
            WalletsAPI.getAllWallets();
            // reset the sync counter
            syncCounter = 0;
          });
        }

        // submits the tx to BitGo for signing and submittal to the P2P network
        $scope.sendTx = function() {
          $scope.processing = true;
          $scope.pendingTransaction.signAndSendTransaction($scope.transaction.passcode, $scope.transaction.otp)
          .then(function(transaction) {
            // Mixpanel general data
            var metricsData = {
              walletID: $rootScope.wallets.current.data.id,
              enterpriseID: $rootScope.enterprises.current.id,
              txTotal: $scope.transaction.total,
              requiresApproval: false
            };

            // Set the confirmation time on the transaction's local object for the UI
            $scope.transaction.confirmationTime = moment().format('MMMM Do YYYY, h:mm:ss A');
            // Handle the success state in the UI
            $scope.transactionSent = true;
            $scope.processing = false;

            if (transaction.pendingApproval) {
              // Track successful send + needs approval
              metricsData.requiresApproval = true;
              AnalyticsProxy.track('SendTx', metricsData);

              // Set local data
              $scope.returnedTransaction.approvalMessage = transaction.pendingApproval.error;
              $scope.returnedTransaction.needsApproval = true;
              return WalletsAPI.getAllWallets();
            } else {
              // Track successful send
              AnalyticsProxy.track('SendTx', metricsData);

              $scope.transaction.transactionId = transaction.transactionId;
              // Sync up the new balances data across the app
              return syncCurrentWallet();
            }
          })
          .catch(function(error) {
            handleTxSendError(error);
          });
        };

        // Cleans out the scope's transaction object and takes the user back to the first step
        $scope.sendMoreFunds = function() {
          resetLocalState();
          $scope.resetSendManager();
        };

        function clearReturnedTxData() {
          $scope.returnedTransaction = {
            approvalMessage: '',
            needsApproval: false
          };
        }

        function init() {
          if (!$scope.transaction) {
            throw new Error('Expect a transaction object when initializing');
          }
          syncCounter = 0;
          $scope.processing = false;
          clearReturnedTxData();
        }
        init();

      }]
    };
  }
]);
