angular.module('BitGo.API.WalletsAPI', [])
/*
  Notes:
  - This module is for managing all http requests and local caching/state
  for all Wallet objects in the app
  - Also manages which wallets to show based on the current enterprise and
  which wallet is being viewed if the user is within an enterprise looking at
  a wallet
*/
.factory('WalletsAPI', ['$q', '$location', '$resource', '$rootScope', 'WalletModel', 'NotifyService', 'UtilityService', 'CacheService', 'LabelsAPI',
  function($q, $location, $resource, $rootScope, WalletModel, Notify, UtilityService, CacheService, LabelsAPI) {
    // $http fetch helpers
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    // local copy of all wallets that exist for a given user
    var allWallets;

    // Cache setup
    var walletCache = CacheService.getCache('Wallets') || new CacheService.Cache('localStorage', 'Wallets', 120 * 60 * 1000);

    /**
      * initializes empty wallet objects for the app / service
      * @private
      */
    function initEmptyWallets() {
      $rootScope.wallets = {
        all: {},
        current: null
      };
      allWallets = {};
    }

    /**
      * Clears all user wallets from the wallet cache
      * @private
      */
    function clearWalletCache() {
      _.forIn(allWallets, function(wallet) {
        walletCache.remove(wallet.data.id);
        console.assert(_.isUndefined(walletCache.get(wallet.data.id)), wallet.data.id + ' was not removed from walletCache');
      });
      initEmptyWallets();
    }

    /**
      * Sets the new current wallet object on rootScope
      * @param wallet {Object} BitGo wallet object
      * @param swapCurrentWallet {Bool} swap the current currentWallet for the new one
      * @private
      */
    function setCurrentWallet(wallet, swapCurrentWallet) {
      if (!wallet) {
        throw new Error('Expect a wallet when setting the current wallet');
      }
      if (_.isEmpty($rootScope.wallets.all)) {
        throw new Error('Missing $rootScope.wallets.all');
      }
      var newCurrentWallet = $rootScope.wallets.all[wallet.data.id];
      if (!newCurrentWallet) {
        throw new Error('Wallet ' + wallet.data.id + ' not found when setting the current wallet');
      }
      // If we're swapping out the current wallet on rootScope
      if (swapCurrentWallet) {
        $rootScope.wallets.all[wallet.data.id] = wallet;
        newCurrentWallet = wallet;
      }
      // Set the  new current wallet
      $rootScope.wallets.current = newCurrentWallet;
      // Broadcast the new event and go to the wallet's transaction list page
      if ($rootScope.wallets.current.data.id !== UtilityService.Url.getWalletIdFromUrl()) {
        // wallet transactions path
        var path = '/enterprise/' + $rootScope.enterprises.current.id +
                   '/wallets/' + $rootScope.wallets.current.data.id;
        $location.path(path);
        $rootScope.$emit('WalletsAPI.CurrentWalletSet', {
          wallets: $rootScope.wallets
        });
      }
    }

    // Wallet Filtering Helpers (filter wallets based on enterprise)
    // Sets |$rootScope.wallets.all| based if the current enterprise selected is personal
    function getPersonalEnterpriseWallets(allWallets) {
      return _.pick(allWallets, function(wallet, key) {
        return !wallet.data.enterprise;
      });
    }

    // Sets |$rootScope.wallets.all| based on the current enterprise selected.
    function getNormalEnterpriseWallets(allWallets, currentEnterprise) {
      return _.pick(allWallets, function(wallet, key) {
        return wallet.data.enterprise && currentEnterprise &&
                wallet.data.enterprise === currentEnterprise.id;
      });
    }

    // Sets |$rootScope.wallets.all| and returns wallets based on the current enterprise selected.
    function getCurrentEnterpriseWallets() {
      if (!$rootScope.enterprises.current) {
        console.log('Cannot filter wallets without a current enterprise');
        return false;
      }
      var currentEnterprise = $rootScope.enterprises.current;
      if (currentEnterprise && currentEnterprise.isPersonal) {
        $rootScope.wallets.all = getPersonalEnterpriseWallets(allWallets);
      } else {
        $rootScope.wallets.all = getNormalEnterpriseWallets(allWallets, currentEnterprise);
      }
    }

    function setAllEnterpriseApprovals() {
      if (!$rootScope.enterprises.all) {
        console.log('Cannot set approvals on enterprises without a enterprises');
        return false;
      }
      _.forIn($rootScope.enterprises.all, function(enterprise) {
        if (enterprise && enterprise.isPersonal) {
          enterprise.setApprovals(getPersonalEnterpriseWallets(allWallets));
        } else {
          enterprise.setApprovals(getNormalEnterpriseWallets(allWallets, enterprise));
        }
      });
    }

    // Event Handlers
    function setFilteredWallets() {
      // Set the correct wallets on rootScope based on the current enterprise
      getCurrentEnterpriseWallets();

      // Init the label cache
      LabelsAPI.initCache();

      var urlWalletId = UtilityService.Url.getWalletIdFromUrl();
      var urlCurrentWallet = $rootScope.wallets.all[urlWalletId];
      if (urlWalletId && urlCurrentWallet) {
        setCurrentWallet(urlCurrentWallet);
      }
    }

    // Set the correct wallets scoped by the current enterprise
    // once we have a current enterprise set in the app
    $rootScope.$on('EnterpriseAPI.CurrentEnterpriseSet', function(evt, data) {
      setFilteredWallets();
    });

    // Fetch all wallets when the user signs in
    $rootScope.$on('UserAPI.CurrentUserSet', function(evt, user) {
      getAllWallets();
    });

    // Clear the wallet cache on user logoout
    $rootScope.$on('UserAPI.UserLogoutEvent', function() {
      clearWalletCache();
    });

    // Fetch the details for a single wallet based on params criteria
    function getWallet(params, cacheOnly) {
      var query = {};
      if (!params) {
        throw new Error('Missing params for getting a wallet');
      }
      if (cacheOnly) {
        var result = walletCache.get(params.bitcoinAddress);
        return $q.when(result);
      }
      if (params.gpk) {
        query.gpk = 1;
      }
      var resource = $resource(kApiServer + '/wallet/' + params.bitcoinAddress);
      return resource.get(query).$promise
      .then(
        function(wallet) {
          wallet = new WalletModel.Wallet(wallet);
          // update the cache and rootScope wallets object
          walletCache.add(params.bitcoinAddress, wallet);
          allWallets[wallet.data.id] = wallet;
          return wallet;
        }
      );
    }

    function emitWalletSetMessage() {
      $rootScope.$emit('WalletsAPI.UserWalletsSet', {
        enterpriseWallets: $rootScope.wallets,
        allWallets: allWallets,
        enterprises: $rootScope.enterprises
      });
    }

    // Fetch all wallets for a user
    function getAllWallets() {
      var resource = $resource(kApiServer + '/wallet?limit=500', {});
      return resource.get({}).$promise
      .then(
        function(data) {
          var pendingFetches = data.wallets.length;

          function onFetchFinished() {
            setFilteredWallets();

            // set pending approvals of all the wallets on enterprises on rootscope
            setAllEnterpriseApprovals();
            // All user wallets are set along with approvals
            emitWalletSetMessage();
            return allWallets;
          }

          function onFetchSuccess(wallet) {
            // we only support safe and safehd wallets currently
            if (wallet.data.type === 'safehd' || wallet.data.type === 'safe') {
              allWallets[wallet.data.id] = wallet;
            }
            if (--pendingFetches === 0) {
              onFetchFinished();
            }
          }

          function onFetchFail(error) {
            // TODO (Gavin): expose errors here?
            if (--pendingFetches === 0) {
              onFetchFinished();
            }
          }

          var numWallets = data.wallets.length;
          if (numWallets > 0){
            // Fetch each single wallet
            // Note: use native 'for in' loop b/c we need to use 'continue'
            for (var idx = 0; idx < numWallets; idx++) {
              var curWallet = data.wallets[idx];
              // Omit custodial accounts
              if (curWallet.custodialAccount) {
                pendingFetches--;
                continue;
              }
              var fetchData = {
                type: curWallet.type,
                bitcoinAddress: curWallet.id
              };
              getWallet(fetchData, false)
              .then(onFetchSuccess)
              .catch(onFetchFail);
            }
          }
          else {
            // User wallets are now set along with approvals. Even though they are empty
            emitWalletSetMessage();
          }
        },
        PromiseErrorHelper()
      );
    }

    // Create a new BitGo safeHD wallet
    function createSafeHD(params) {
      /**
      * Converts the id provided into an id expected by the server
      * @param id {String} id to modify
      * @private
      */
      function safeId(id) {
        if (!id || typeof(id) !== 'string') {
          throw new Error('Missing id');
        }
        return (id === 'personal') ? '' : id;
      }

      if (!params.xpubs || !params.label) {
        throw new Error('Invalid data when generating safeHD wallet');
      }
      // pull the xpubs out of the params
      var keychains = params.xpubs.map(function(xpub) { return {xpub: xpub}; });
      var walletData = {
        label: params.label,
        m: 2,
        n: 3,
        keychains: keychains,
        enterprise: safeId($rootScope.enterprises.current.id)
      };

      var resource = $resource(kApiServer + '/wallet', {});
      return new resource(walletData).$save({})
      .then(
        function(wallet) {
          var decoratedWallet = new WalletModel.Wallet(wallet);
          walletCache.add(decoratedWallet.data.id, decoratedWallet);
          return decoratedWallet;
        },
        PromiseErrorHelper()
      );
    }

    /**
      * Create a new chain address for the wallet
      * @param bitcoinAddress {String}
      * @param chain {Int} is this an internal or external chain
      * @param allowExisting {Bool} if true, allow re-use of existing, unused addresses
      * @returns {Promise}
      */
    function createChainAddress(bitcoinAddress, chain, allowExisting) {
      if (!bitcoinAddress || !chain.toString() || !allowExisting.toString()) {
        throw new Error('invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + bitcoinAddress + '/address/' + chain, {});
      return new resource({ allowExisting: allowExisting }).$save()
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * @description Revoke Access to a wallet for a particular user
      * @param {String} The bitcoin address of the wallet you want revoked
      * @param {String} The userId of the person to be revoked
      * @returns {promise} with success/error messages
    */
    function revokeAccess(bitcoinAddress, userId) {
      if (!bitcoinAddress || !userId) {
        throw new Error('Invalid params');
      }
      var params = {user: userId};
      var resource = $resource(kApiServer + '/wallet/' + bitcoinAddress + '/policy/revoke', {});
      return new resource(params).$save()
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * Create a new receive address for a wallet
      * @param bitcoinAddress {String}
      * @param allowExisting {Bool}
      * @returns {Promise}
      */
    function createReceiveAddress(bitcoinAddress, allowExisting) {
      if (!bitcoinAddress || !allowExisting.toString()) {
        throw new Error('invalid params');
      }
      return createChainAddress(bitcoinAddress, 0, allowExisting);
    }

    /**
      * Create a new change address for a wallet
      * @param bitcoinAddress {String}
      * @returns {Promise}
      */
    function createChangeAddress(bitcoinAddress) {
      if (!bitcoinAddress) {
        throw new Error('invalid params');
      }
      return createChainAddress(bitcoinAddress, 1, false);
    }

    /**
      * List all addresses for a wallet
      * @param {object} params for the address list query
      * @returns {object} promise with data for address list fetch
      */
    function getAllAddresses(params) {
      if (!params.bitcoinAddress || !params.limit || !params.chain.toString()) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + params.bitcoinAddress + '/addresses', {
        limit: params.limit,
        skip: params.skip || 0,
        sort: params.sort || 1,
        chain: params.chain || 0,
        details: params.details || false
      });
      return resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
     * Returns info needed to recover a specific wallet
     * @param {String} params for the wallet data recovery fetch
     * @returns {Promise} with wallet recovery info
     * @public
     */
    function getWalletPasscodeRecoveryInfo(params) {
      if (!params.walletAddress) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + params.walletAddress + '/passcoderecovery', {});
      return new resource(params).$save({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
     * Deletes a wallet
     * @param {object} params for the wallet containing bicoin Address information
     * @returns {Promise} with success/error
     * @public
     */
    function removeWallet(wallet) {
      if (!wallet) {
        throw new Error('Invalid params');
      }
      var params = {walletAddress: wallet.data.id};
      var resource = $resource(kApiServer + '/wallet/' + wallet.data.id, {});
      return new resource(params).$remove({})
      .then(
        function(data){
          // cleans up data before next wallets fetch
          wallet.data.pendingApprovals.forEach(function(pendingApproval){
            $rootScope.enterprises.current.deleteApproval(pendingApproval.id);
          });
          removeWalletFromScope(wallet);
        },
        PromiseErrorHelper()
      );
    }

    /**
     * Deletes a wallet form the client. Removes it from allWallets and rootscope
     * @param {object} wallet which needs to be removed
     * @public
     */
    function removeWalletFromScope(wallet) {
      if (!wallet) {
        throw new Error('Invalid params, cannot remove wallet from scope');
      }
      delete allWallets[wallet.data.id];
      delete $rootScope.wallets.all[wallet.data.id];
    }

    /**
     * Updates the name of a wallet
     * @param {Object} params for the wallet name change. Contains wallet Address and new label
     * @returns {Promise} with success/error
     * @public
     */
    function renameWallet(params) {
      if (!params.walletAddress || !params.label) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + params.walletAddress, {}, {
        update: { method: 'PUT' }
      });
      return new resource(params).$update({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
     * Returns all wallets from the cache for recovery
     * @returns {Promise} with all cached wallets
     * @public
     */
    function getWalletsForRecovery() {
      return $q.when(allWallets);
    }

    function init() {
      initEmptyWallets();
    }
    init();

    // In-client API
    return {
      createSafeHD: createSafeHD,
      createChainAddress: createChainAddress,
      createChangeAddress: createChangeAddress,
      createReceiveAddress: createReceiveAddress,
      getWallet: getWallet,
      getAllWallets: getAllWallets,
      getAllAddresses: getAllAddresses,
      setCurrentWallet: setCurrentWallet,
      getWalletPasscodeRecoveryInfo: getWalletPasscodeRecoveryInfo,
      getWalletsForRecovery: getWalletsForRecovery,
      removeWallet: removeWallet,
      removeWalletFromScope: removeWalletFromScope,
      renameWallet: renameWallet,
      revokeAccess: revokeAccess
    };
  }
]);
