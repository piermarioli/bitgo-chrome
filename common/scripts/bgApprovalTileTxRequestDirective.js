/**
 * @ngdoc directive
 * @name bgApprovalTileBitcoinWhitelist
 * @description
 * This directive manages the approval tile state for transaction approval requests
 * @example
 *   <span bg-approval-tile-tx-request>TILE CONTEXT</span>
 */
angular.module('BitGo.Common.BGApprovalTileTxRequestDirective', [])

.directive("bgApprovalTileTxRequest", ['$modal', '$rootScope', 'ApprovalsAPI', 'TransactionsAPI', 'NotifyService', 'UtilityService', 'BG_DEV', 'AnalyticsProxy',
  function ($modal, $rootScope, ApprovalsAPI, TransactionsAPI, NotifyService, UtilityService, BG_DEV, AnalyticsProxy) {
    return {
      restrict: 'A',
      controller: ['$scope', function($scope) {
        /** All valid tile view states */
        $scope.viewStates = ['initial'];
        /** object hoding the tasansaction info for submittal */
        $scope.txInfo = null;
        /** handle ui state */
        $scope.processing = null;

        /** Show different templates if the approval is one the currentUser created */
        $scope.userIsCreator = $rootScope.currentUser.settings.id === $scope.approvalItem.creator;

        $scope.resetTxInfo = function() {
          var existingOtp = $scope.txInfo.otp;
          $scope.txInfo = {
            transaction: {},
            passcode: '',
            otp: existingOtp
          };
        };

        /**
        * Initializes the directive's controller state
        * @private
        */
        function init() {
          $scope.state = 'initial';
          $scope.processing = false;
          $scope.txInfo = {
            transaction: {},
            passcode: '',
            otp: ''
          };
        }
        init();
      }],
      link: function(scope, element, attrs) {
        /** Valid pending approval states */
        var validApprovalTypes = ['approved', 'rejected'];

        /** Triggers otp modal to open if user needs to otp */
        function openModal(params) {
          if (!params || !params.type) {
            throw new Error('Missing modal type');
          }
          var modalInstance = $modal.open({
            templateUrl: 'modal/templates/modalcontainer.html',
            controller: 'ModalController',
            scope: scope,
            size: params.size,
            resolve: {
              // The return value is passed to ModalController as 'locals'
              locals: function () {
                return {
                  type: params.type,
                  userAction: BG_DEV.MODAL_USER_ACTIONS.approveSendFunds,
                  wallet: $rootScope.wallets.all[scope.approvalItem.bitcoinAddress]
                };
              }
            }
          });
          return modalInstance.result;
        }

        /** Subtmit the tx to bitgo and see if it is valid before approving the approval */
        scope.submitTx = function() {
          // Deserialize the tx to submit it
          var deserializedTx;
          try {
            scope.txInfo.transaction = scope.approvalItem.info.transactionRequest;
            deserializedTx = Bitcoin.Transaction.deserialize(Bitcoin.Util.hexToBytes(scope.txInfo.transaction.transaction));
          } catch(error) {
            console.log('Issue when deserializing the transaction');
            NotifyService.error('There is an issue with this transaction. Please refresh the page and try your action again.');
            return;
          }
          // Set variables up for submittal
          var sender = {
            wallet: $rootScope.wallets.all[scope.approvalItem.bitcoinAddress],
            passcode: scope.txInfo.passcode,
            otp: scope.txInfo.otp
          };
          scope.processing = true;

          var tb = new TransactionsAPI.clone(sender, deserializedTx);
          // try to sign the transaction before handling the approval
          tb.signTransaction(scope.txInfo.passcode, scope.txInfo.otp)
          .then(function(transaction) {
            // set the tx on the txInfo object before submitting
            scope.txInfo.tx = transaction.tx();
            scope.submitApproval('approved');
          })
          .catch(function(error) {
            if (UtilityService.API.isOtpError(error)) {
              // If the user needs to OTP, use the modal to unlock their account
              openModal({ type: BG_DEV.MODAL_TYPES.otpThenUnlock })
              .then(function(result) {
                if (result.type === 'otpThenUnlockSuccess') {
                  if (!result.data.otp) {
                    throw new Error('Missing otp');
                  }
                  if (!result.data.password) {
                    throw new Error('Missing login password');
                  }
                  // set the otp code on the txInfo object before resubmitting it
                  scope.txInfo.otp = result.data.otp;
                  scope.txInfo.passcode = result.data.password;
                  // resubmit the tx on window close
                  scope.submitTx();
                }
              })
              .catch(function(error) {
                scope.processing = false;
              });
            }
            else if (UtilityService.API.isPasscodeError(error)) {
              openModal({ type: BG_DEV.MODAL_TYPES.passwordThenUnlock })
              .then(function(result) {
                if (result.type === 'otpThenUnlockSuccess') {
                  if (!result.data.password) {
                    throw new Error('Missing login password');
                  }
                  scope.txInfo.passcode = result.data.password;
                  // resubmit to share wallet
                  scope.submitTx();
                }
              })
              .catch(function(error) {
                scope.processing = false;
              });
            } else {
              scope.processing = false;
              // Otherwise just display the error to the user
              NotifyService.error(error.error || error);
            }
          });
        };

        /**
        * Updates a pending approval's state / and the DOM once set
        * @param {string} approval's new state to set
        * @public
        */
        scope.submitApproval = function(newState) {
          if (_.indexOf(validApprovalTypes, newState) === -1) {
            throw new Error('Expect valid approval state to be set');
          }
          var data = {
            state: newState,
            id: scope.approvalItem.id,
            wallet: scope.approvalItem.bitcoinAddress,
            tx: scope.txInfo.tx
          };
          ApprovalsAPI.update(scope.approvalItem.id, data)
          .then(function(result) {
            // Mixpanel Tracking (currently track only successful tx approvals)
            if (newState === 'approved') {
              // Track the successful approval of a tx
              var metricsData = {
                walletID: scope.approvalItem.bitcoinAddress,
                enterpriseID: $rootScope.enterprises.current.id,
                txTotal: scope.approvalItem.info.transactionRequest.requestedAmount
              };
              AnalyticsProxy.track('ApproveTx', metricsData);
            }

            $('#' + scope.approvalItem.id).animate({
              height: 0,
              opacity: 0
            }, 500, function() {
              scope.$apply(function() {
                // let any listeners know about the approval to do work
                scope.$emit('bgApprovalTileTxRequest.TxApprovalStateSet', result);
                // remove the approval from the appropriate places
                $rootScope.enterprises.current.deleteApproval(scope.approvalItem.id);
                $rootScope.wallets.all[scope.approvalItem.bitcoinAddress].deleteApproval(scope.approvalItem.id);
                // handle the DOM cleanup
                $('#' + scope.approvalItem.id).remove();
                scope.$destroy();
              });
            });
          })
          .catch(function(error) {
            scope.processing = false;
            var failAction = (newState === 'approved') ? 'approving' : 'rejecting';
            NotifyService.error('There was an issue ' + failAction + ' this request. Please try your action again.');
          });
        };
      }
    };
  }
]);
