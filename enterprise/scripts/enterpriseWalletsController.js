/*
  Notes:
  - This controls the view for the enterprise wallet list page
*/
angular.module('BitGo.Enterprise.EnterpriseWalletsController', [])

.controller('EnterpriseWalletsController', ['$q', '$scope', '$modal', '$rootScope', '$location', '$filter', 'WalletsAPI', 'WalletSharesAPI', 'UtilityService', 'NotifyService', 'KeychainsAPI', 'EnterpriseAPI', 'BG_DEV', 'SyncService', 'RequiredActionService', 'AnalyticsProxy',
  function($q, $scope, $modal, $rootScope, $location, $filter, WalletsAPI, WalletSharesAPI, UtilityService, Notify, KeychainsAPI, EnterpriseAPI, BG_DEV, SyncService, RequiredActionService, AnalyticsProxy) {
    // id of wallet to be shared
    var localWalletShare;
    // show the ui if user has access to any wallets
    $scope.noWalletsAcrossEnterprisesExist = null;
    // show the ui if filtered wallets exist
    $scope.filteredWalletsExist = null;
    // show the ui for no wallets existing
    $scope.noWalletsExist = null;
    // Helps in UI when share is in process
    $scope.processShare = false;
    // show the ui if filtered walletshares exist
    $scope.filteredWalletSharesExist = null;
    // show the ui for no wallet shares existing
    $scope.noWalletSharesExist = null;

    /**
      * show the wallet list once filtering listeners are stabilized
      * @private
      */
    function setFilteredWalletsForUI() {
      if (!_.isEmpty($rootScope.wallets.all)) {
        $scope.filteredWalletsExist = true;
        $scope.noWalletsExist = false;
      } else {
        $scope.filteredWalletsExist = false;
        $scope.noWalletsExist = true;
      }
    }

    /**
      * show the wallet shares list once filtering listeners are stabilized
      * @private
      */
    function setFilteredWalletSharesForUI() {
      // incase of success wallet share, we want to stop processing share before displayign wallets
      $scope.processShare = false;
      if (!_.isEmpty($rootScope.walletShares.all.incoming)) {
        $scope.filteredWalletSharesExist = true;
        $scope.noWalletSharesExist = false;
      } else {
        $scope.filteredWalletSharesExist = false;
        $scope.noWalletSharesExist = true;
      }
    }

    // show the UI when there are no wallets, walletshares in current enterprise but are present in other enterprises
    $scope.noWalletsInEnterprise = function() {
      return $scope.noWalletsExist && $scope.noWalletSharesExist && !$scope.noWalletsAcrossEnterprisesExist;
    };

    // show the welcome message if no wallets or walletshares exist and sharing isn't in process
    $scope.canShowWelcomeMessage = function() {
      return $scope.noWalletSharesExist && $scope.noWalletsAcrossEnterprisesExist && !$scope.processShare;
    };

    // Link off to the create new wallet flow
    $scope.createNewWallet = function() {
      // track the create flow kick-off
      AnalyticsProxy.track('CreateWalletStarted');

      // If the user has a weak login password, we force them to upgrade it
      // before they can create any more wallets
      if (RequiredActionService.hasAction(BG_DEV.REQUIRED_ACTIONS.WEAK_PW)) {
        return RequiredActionService.runAction(BG_DEV.REQUIRED_ACTIONS.WEAK_PW);
      }
      try {
        $location.path('/enterprise/' + $rootScope.enterprises.current.id + '/wallets/create');
      } catch(error) {
        console.error('Expect $rootScope\'s current enterprise to be set.');
      }
    };

    // function to check if the user can create wallets on the current enterprise
    $scope.canCreateWallet = function() {
      if ($rootScope.enterprises.current && $rootScope.enterprises.current.isPersonal) {
        return true;
      }
      if (!$rootScope.currentUser.settings.enterprises) {
        return false;
      }
      return $rootScope.currentUser.settings.enterprises.some(function(enterprise) {
       if ($rootScope.enterprises.current && enterprise.id === $rootScope.enterprises.current.id) {
        return true;
       }
      });
    };

    // Link in to a specific wallet and set the current wallet on rootscope
    $scope.goToWallet = function(wallet) {
      WalletsAPI.setCurrentWallet(wallet);
    };

    /**
    * accepts wallet share.
    * Steps for accepting a wallet share
    *   - Fetch the details of the wallet share from the server.
    *   - Get ECDH keychain of the current user.
    *   - decrypt the xprv with the users passcode.
    *   - get the echd secret
    *   - get the shared wallet xprv with the secret and the pubkey
    *   - encrypt the shared wallet xprv with the passcode
    *   - send this data to the server
    * @params - The wallet share you want to accept
    * @returns {promise} with data/error from the server calls.
    */
    $scope.acceptShare = function(walletShare) {
      $scope.processShare = true;
      if (walletShare) {
        localWalletShare = walletShare;
      }
      var params = {
        state: 'accepted',
        shareId: localWalletShare.id
      };
      var role = $filter('bgPermissionsRoleConversionFilter')(localWalletShare.permissions);
      if (role === BG_DEV.WALLET.ROLES.ADMIN || role === BG_DEV.WALLET.ROLES.SPEND) {
        WalletSharesAPI.getSharedWallet({shareId: localWalletShare.id})
        .then(function(data){
          // check if the wallet is a cold wallet. If so accept share without getting secret etc. (this just behaves as a 'view only' share wallet)
          if (!data.keychain) {
            return WalletSharesAPI.updateShare(params).then(shareUserSuccess);
          } else {
            return KeychainsAPI.get($rootScope.currentUser.settings.ecdhKeychain)
            .then(function(sharingKeychain) {
              if (!sharingKeychain.encryptedXprv) {
                throw new Error('EncryptedXprv was not found on sharing keychain');
              }
              if (!$scope.password){
                var errorData = {
                  status: 401,
                  message: "Missing Password",
                  data: { needsPasscode: true, key: null }
                };
                return $q.reject(UtilityService.ErrorHelper(errorData));
              }
              // Now we have the sharing keychain, we can work out the secret used for sharing the wallet with us
              sharingKeychain.xprv = UtilityService.Crypto.sjclDecrypt($scope.password, sharingKeychain.encryptedXprv);
              var rootExtKey = new BIP32(sharingKeychain.xprv);
              // Derive key by path (which is used between these 2 users only)
              var extKey = rootExtKey.derive(data.keychain.path);
              var secret = UtilityService.Crypto.getECDHSecret(extKey.eckey.priv, data.keychain.fromPubKey);

              // Yes! We got the secret successfully here, now decrypt the shared wallet xprv
              var decryptedSharedWalletXprv = UtilityService.Crypto.sjclDecrypt(secret, data.keychain.encryptedXprv);

              encryptedSharedWalletXprv = UtilityService.Crypto.sjclEncrypt($scope.password, decryptedSharedWalletXprv);
              params.encryptedXprv = encryptedSharedWalletXprv;
              return WalletSharesAPI.updateShare(params);
            });
          }
        }).then(shareUserSuccess)
        .catch(onAcceptShareFail);
      }
      else {
        return WalletSharesAPI.updateShare(params).then(shareUserSuccess);
      }
    };

    function shareUserSuccess() {
      // TODO Barath. Might be a better (smoother for UI) way to accept share
      SyncService.sync();
    }

    function rejectShareSuccess() {
      $scope.processShare = false;
      WalletSharesAPI.getAllSharedWallets();
    }

    // reject a share
    $scope.rejectShare = function(walletShare) {
      $scope.processShare = true;
      WalletSharesAPI.cancelShare({shareId: walletShare.id})
      .then(rejectShareSuccess)
      .catch(Notify.errorHandler);
    };

    // Event Listeners
    // Listen for the enterprises's wallet shares to be set before showing the list
    var killWalletSharesListener = $rootScope.$on('WalletSharesAPI.FilteredWalletSharesSet',
      function(evt, data) {
        setFilteredWalletSharesForUI();
      }
    );

    // Event Listeners
    // Listen for all user wallets to be set
    var killUserWalletsListener = $rootScope.$on('WalletsAPI.UserWalletsSet',
      function(evt, data) {
        if (_.isEmpty(data.allWallets)) {
          $scope.noWalletsAcrossEnterprisesExist = true;
        } else {
          $scope.noWalletsAcrossEnterprisesExist = false;
        }
        setFilteredWalletsForUI();
      }
    );

    // Clean up the listeners -- helps decrease run loop time and
    // reduce liklihood of references being kept on the scope
    $scope.$on('$destroy', function() {
      killWalletSharesListener();
      killUserWalletsListener();
    });

    function onAcceptShareFail(error) {
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
            $scope.password = result.data.password;
            // resubmit to share wallet
            return $scope.acceptShare();
          }
        }).catch(function(){
          $scope.processShare = false;
        });
      }
      else if (UtilityService.API.isPasscodeError(error)) {
        openModal({ type: BG_DEV.MODAL_TYPES.passwordThenUnlock })
        .then(function(result) {
          if (result.type === 'otpThenUnlockSuccess') {
            if (!result.data.password) {
              throw new Error('Missing login password');
            }
            $scope.password = result.data.password;
            // resubmit to share wallet
            return $scope.acceptShare();
          }
        }).catch(function(){
          $scope.processShare = false;
        });
      }
      else {
        $scope.processShare = false;
        // Otherwise just display the error to the user
        Notify.error(error.error || error);
      }
    }

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
              userAction: BG_DEV.MODAL_USER_ACTIONS.acceptShare,
            };
          }
        }
      });
      return modalInstance.result;
    }

    function init() {
      $rootScope.setContext('enterpriseWalletsList');

      $scope.balance = {
        bitcoinTotal: 0
      };
      $scope.noWalletsAcrossEnterprisesExist = false;
      $scope.filteredWalletsExist = false;
      $scope.noWalletsExist = false;
      $scope.filteredWalletSharesExist = false;
      $scope.noWalletSharesExist = false;
    }
    init();
  }
]);
