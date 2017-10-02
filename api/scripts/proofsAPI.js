/**
 * @ngdoc service
 * @name ProofsAPI
 * @description
 * Manages the http requests dealing with proof of reserves
 */
angular.module('BitGo.API.ProofsAPI', [])

.factory('ProofsAPI', ['$q', '$location', '$resource', 'UtilityService',
  function($q, $location, $resource, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * List all proofs
    * @private
    */
    function list() {
      var resource = $resource(kApiServer + '/proof', {});
      return new resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
    * Get a patner's proof based on hash
    * @private
    */
    function get(proofId) {
      if (!proofId) {
        throw new Error('missing proofId');
      }
      var resource = $resource(kApiServer + '/proof/' + proofId, {});
      return new resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
    * Get a specific liability proof
    * @private
    */
    function getLiability(params) {
      if (!params.hash) {
        throw new Error('invalid params');
      }
      var resource = $resource(kApiServer + '/proof/liability/' + params.hash, {});
      return new resource.get({ user: params.userId, nonce: params.nonce }).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /** In-client API */
    return {
      get: get,
      getLiability: getLiability,
      list: list
    };
  }
]);
