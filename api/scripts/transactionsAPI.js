angular.module('BitGo.API.TransactionsAPI', [])

.factory('TransactionsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService', 'WalletsAPI', 'KeychainsAPI', 'SDK', 'BG_DEV',
  function($q, $location, $resource, $rootScope, UtilityService, WalletsAPI, KeychainsAPI, SDK, BG_DEV) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
      * List all historical txs for a wallet
      * @param {object} wallet object
      * @param {object} params for the tx query
      * @returns {array} promise with array of wallettx items
      */
    function list(wallet, params) {
      if (!wallet || !params) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/:walletId/wallettx', {
        walletId: wallet.data.id,
        skip: params.skip || 0
      });
      return resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * Get the tx history for a single wallettx item
      * @param {string} wallettx id
      * @returns {object} promise with the updated wallettx obj
      */
    function getTxHistory(walletTxId) {
      if (!walletTxId) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallettx/' + walletTxId, {});
      return resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * Update a commment on a wallettx item
      * @param {string} wallet id
      * @param {string} wallettx id
      * @param {string} new comment for the transaction
      * @returns {object} promise with the updated wallettx obj
      */
    function updateComment(walletId, walletTxId, comment) {
      if (!walletId || !walletTxId || typeof(comment) === 'undefined') {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallettx/:walletTxId/comment', {
        walletId: walletId,
        walletTxId: walletTxId
      });
      return resource.save({ comment: comment }).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // Send a transaction to the BitGo servers
    function post(transaction) {
      var resource = $resource(kApiServer + "/tx/send", {});
      return new resource(transaction).$save({});
    }

    // Get the list of unspents for a wallet
    function getUTXO(bitcoinAddress, target) {
      var resource = $resource(kApiServer + '/wallet/' + bitcoinAddress + '/unspents', { target: target });
      return new resource.get({}).$promise;
    }

    // In-client API
    return {
      getTxHistory: getTxHistory,
      updateComment: updateComment,
      list: list
    };
  }
]);
