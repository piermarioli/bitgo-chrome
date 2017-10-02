angular.module('BitGo.API.LabelsAPI', [])
/*
  Notes:
  - This module is for managing all http requests for labels
*/
.factory('LabelsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService', 'CacheService',
  function($q, $location, $resource, $rootScope, UtilityService, CacheService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    // simple in-memory cache
    var labelsCache = {};

    /**
     * Init the label cache
     */
    function initCache() {
      if (_.isEmpty(labelsCache) || _.isEmpty($rootScope.wallets.all)) {
        return;
      }
      _.forEach($rootScope.wallets.all, function(wallet) {
        get(wallet.data.id, wallet.data.id);
      });
    }

    /**
     * Augment the label cache with the user's wallet labels
     * @param wallets {Object} all wallets the user has access to
     * @private
     */
    function augmentCacheWithWallets(wallets) {
      if (!wallets) {
        throw new Error('missing user wallets');
      }
      _.forIn(wallets, function(wallet) {
        var entry = [{
          walletId: wallet.data.id,
          label: wallet.data.label
        }];
        labelsCache[wallet.data.id] = entry;
      });
    }

    // Adds labels for a wallet to the in-memory cache
    function addLabelToCache(label) {
      // If the label doesn't have an address, it is of
      // no use to us.  This shouldn't happen.
      if (!label.address) {
        return;
      }
      // The cache is a map of entries indexed by walletId.
      // Each entry is an array of [walletId, label] pairs.
      // This way, if two wallets each define a label for the same bitcoin address,
      // we can be sure to use the right one.  This is annoying, but the edge case exists.
      var entry = labelsCache[label.address] || [];
      // remove existing labels
      _.remove(entry, function(entryItem) {
        return entryItem.walletId === label.walletId;
      });
      // add the new label
      entry.push({ walletId: label.walletId, label: label.label} );
      // add the new labels array for this wallet to the cache
      labelsCache[label.address] = entry;
    }

    /**
     * Removes labels for a wallet from in-memory cache
     * @param label {Object} A label of a particular address
     * @private
     */
    function removeLabelFromCache(label) {
      // If the label doesn't have an address, it is of
      // no use to us.  This shouldn't happen.
      if (!label.address) {
        return;
      }
      var entry = labelsCache[label.address] || [];
      // remove existing labels
      _.remove(entry, function(entryItem) {
        return entryItem.walletId === label.walletId;
      });
      // add the new labels array for this wallet to the cache
      labelsCache[label.address] = entry;
    }

    // Add a label to an address for a wallet
    function add(params) {
      var resource = $resource(kApiServer + '/labels/' + params.walletId + '/' + params.address, {}, {
        'save': { method: 'PUT' }
      });
      return new resource.save({ label: params.label }).$promise
      .then(
        function(data) {
          addLabelToCache(data);
          return data;
        },
        PromiseErrorHelper()
      );
    }

    /**
     * Delete a label for an address in a wallet
     * @param label {Object} Object containing a walletid and address
     * @return promise
     * @public
     */
    function remove(params) {
      if (!params.walletId || !params.address) {
        return;
      }
      var resource = $resource(kApiServer + '/labels/' + params.walletId + '/' + params.address, {});
      return new resource({}).$delete()
      .then(
        function(data) {
          removeLabelFromCache(data);
          return data;
        },
        PromiseErrorHelper()
      );
    }

    // Return a list of labeled addresses associated with a wallet
    function list() {
      // Cache was already loaded - return it
      if (!_.isEmpty(labelsCache)) {
        return $q.when(labelsCache);
      }
      var resource = $resource(kApiServer + '/labels/', {});
      return resource.get({}).$promise
      .then(
        function(data) {
          _.forEach(data.labels, function(label) {
            addLabelToCache(label);
          });
          return labelsCache;
        },
        PromiseErrorHelper()
      );
    }

    // Return a label for an address hopefully scoped by wallet
    function get(address, walletId) {
      if (!walletId || !address) {
        console.log('Missing get address arguments');
        return $q.reject();
      }
      return list()
      .then(function() {
        var cacheEntry = labelsCache[address];
        if (!cacheEntry || cacheEntry.length === 0) {
          return undefined;
        }
        var result = cacheEntry.reduce(function(item) {
          if (!item) {
            return;
          }
          return (item.walletId === walletId) ? item.label : undefined;
        });
        // Return the match or just return the first entry.
        // Note that this policy intentionally returns cross-
        // wallet matches.
        return result ? result : cacheEntry[0].label;
      });
    }

    /**
     * Fetch the user's labels to populate the cache when they log in
     */
    $rootScope.$on('UserAPI.CurrentUserSet', function(evt) {
      list().catch(function(error) {
        console.error('Error initializing user labels: ', error);
      });
    });

    /**
     * Augment the label cache with the wallet labels when wallets become available
     */
    $rootScope.$on('WalletsAPI.UserWalletsSet', function(evt, data) {
      if (!_.isEmpty(data.allWallets)) {
        augmentCacheWithWallets(data.allWallets);
      }
    });

    // In-client API
    return {
      get: get,
      add: add,
      list: list,
      initCache: initCache,
      remove: remove
    };
  }
]);
