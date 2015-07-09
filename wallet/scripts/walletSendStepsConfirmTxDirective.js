/**
  Directive to manage the wallet send flows
  - Parent Controller is from the walletSendManagerDirective
 */
angular.module('BitGo.Wallet.WalletSendStepsConfirmTxDirective', [])

.directive('walletSendStepsConfirmTx', ['$q', '$filter', '$modal', '$timeout', '$rootScope', 'NotifyService', 'TransactionsAPI', 'UtilityService', 'WalletsAPI', 'SDK', 'BG_DEV', 'AnalyticsProxy', 'UserAPI',
  function($q, $filter, $modal, $timeout, $rootScope, NotifyService, TransactionsAPI, UtilityService, WalletsAPI, SDK, BG_DEV, AnalyticsProxy, UserAPI) {
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

        // function which returns a needs unlock error
        function otpError() {
          return $q.reject(UtilityService.ErrorHelper({
            status: 401,
            data: { needsOTP: true, key: null },
            message: "Missing otp"
          }));
        }

        function handleTxSendError(error) {
          if (error.status === 202) {
            // tx needs approval

            // Mixpanel general data
            var metricsData = {
              walletID: $rootScope.wallets.current.data.id,
              enterpriseID: $rootScope.enterprises.current.id,
              requiresApproval: true
            };

            // Set the confirmation time on the transaction's local object for the UI
            $scope.transaction.confirmationTime = moment().format('MMMM Do YYYY, h:mm:ss A');
            // Handle the success state in the UI
            $scope.transactionSent = true;
            $scope.processing = false;

            // Track successful send
            AnalyticsProxy.track('SendTx', metricsData);

            // Set local data
            $scope.returnedTransaction.approvalMessage = error.message;
            $scope.returnedTransaction.needsApproval = true;
            return WalletsAPI.getAllWallets();
          } else if (UtilityService.API.isOtpError(error)) {
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
            Raven.captureException(error, { tags: { loc: 'ciaffux5b0001sw52cnz1jpk7' }});
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

        /**
         * Submit the tx to BitGo for signing and submittal to the P2P network
         *
         * @returns {Object} promise for sending the tx
         */
        $scope.sendTx = function() {
          $scope.processing = true;
          var walletId = $rootScope.wallets.current.data.id;

          // the transaction to be submitted in hex format
          var txhex;

          // an SDK wallet object to be retrieved using the SDK
          var wallet;

          // the list of unspents to be used in signing
          var unspents;

          // the recipients of the transaction
          var recipients = {};
          recipients[$scope.pendingTransaction.recipient.address] = $scope.pendingTransaction.recipient.satoshis;

          return UserAPI.session()
          .then(function(data){
            if (data.session) {
              // if the data returned does not have an unlock object, then the user is not unlocked
              if (!data.session.unlock) {
                return otpError();
              } else {
                // if the txvalue for this unlock exeeds transaction limit, we need to unlock again
                if (data.session.unlock.txValue !== 0 && $scope.pendingTransaction.recipient.satoshis > (data.session.unlock.txValueLimit - data.session.unlock.txValue)) {
                  return otpError();
                }
              }
            } else {
              throw new Error('Could not fetch user session');
            }

            // check if we have the passcode.  Incase the user has been
            // unlocked, but we dont have the passcode (which is needed to
            // decrypt the private key whether unlocked or not) and need to
            // return an error to pop up the modal
            if (!$scope.transaction.passcode) {
              return $q.reject(UtilityService.ErrorHelper({
                status: 401,
                data: { needsPasscode: true, key: null },
                message: "Missing password"
              }));
            }
          }).then(function() {
            return SDK.get().wallets().get({ id: walletId });
          })
          .then(function(res) {
            wallet = res;
            return wallet.createTransaction({ recipients: recipients });
          })
          .then(function(res) {
            txhex = res.transactionHex; // unsigned txhex
            unspents = res.unspents;
            var fee = res.fee;
            var prevFee = $scope.pendingTransaction.fee;
            $scope.pendingTransaction.fee = fee;
            $scope.transaction.blockchainFee = fee;
            if (prevFee !== fee) {
              throw new Error('Transaction inputs have changed - please reconfirm fees');
            }

            if (wallet.type() === 'safehd') {
              // safehd is the default wallet type
              return wallet.getEncryptedUserKeychain({})
              .then(function(keychain) {
                // check if encrypted xprv is present. It is not present for cold wallets
                if (!keychain.encryptedXprv) {
                  return $q.reject(UtilityService.ErrorHelper({
                    status: 401,
                    data: {},
                    message: "Cannot transact. No user key is present on this wallet."
                  }));
                }
                keychain.xprv = SDK.get().decrypt({ input: keychain.encryptedXprv, password: $scope.transaction.passcode });
                return wallet.signTransaction({ transactionHex: txhex, keychain: keychain, unspents: unspents });
              });
            } else if (wallet.type() === 'safe') {
              // legacy support for safe wallets
              var decryptSigningKey = function(account, passcode) {
                var findChainRoot = function(account) {
                  if (account.chain && account.chain.parent) {
                    var result = findChainRoot(account.chain.parent);
                    if (result.key) {
                      var chainCode = Bitcoin.Util.hexToBytes(account.chain.code);
                      var eckey = Bitcoin.ECKey.createECKeyFromChain(result.key, chainCode);
                      result.key = eckey.getWalletImportFormat();
                    }
                    return result;
                  }
                  // At the root, decrypt the priv key here.
                  try {
                    var privKey = SDK.get().decrypt({password: passcode, input: account.private.userPrivKey});
                    return { key: privKey };
                  } catch (e) {
                    throw new Error('Invalid password: ' + e);
                  }
                };
                return findChainRoot(account);
              };

              var passcode = $scope.transaction.passcode;
              params = {
                bitcoinAddress: wallet.id(),
                gpk: true
              };
              return WalletsAPI.getWallet(params, false)
              .then(function(w) {
                var account = w.data;
                var signingKey = decryptSigningKey(account, passcode).key;
                return wallet.signTransaction({ transactionHex: txhex, signingKey: signingKey, unspents: unspents });
              });
            } else {
              throw new Error('wallet type not supported');
            }
          })
          .then(function(signedtx) {
            if (!signedtx) {
              throw new Error('failed to sign transaction');
            }
            signedtx.message = $scope.transaction.message;
            return wallet.sendTransaction(signedtx);
          })
          .then(function(res) {
            // transaction sent success
            var hash = res.hash;

            // Mixpanel general data
            var metricsData = {
              walletID: $rootScope.wallets.current.data.id,
              enterpriseID: $rootScope.enterprises.current.id,
              requiresApproval: false
            };

            // Set the confirmation time on the transaction's local object for the UI
            $scope.transaction.confirmationTime = moment().format('MMMM Do YYYY, h:mm:ss A');
            // Handle the success state in the UI
            $scope.transactionSent = true;
            $scope.processing = false;

            // Track successful send
            AnalyticsProxy.track('SendTx', metricsData);

            $scope.transaction.transactionId = hash;
            // Sync up the new balances data across the app
            return syncCurrentWallet();
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
