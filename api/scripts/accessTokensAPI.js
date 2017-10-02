/**
 * @ngdoc service
 * @name AccessTokensAPI
 * @description
 * This manages app API requests for the access token functionality in BitGo
 */
angular.module('BitGo.API.AccessTokensAPI', [])

.factory('AccessTokensAPI', ['$resource', 'UtilityService',
  function($resource, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * Add an access token to a user
    * @param params {Object}
    * @private
    */
    function add(params) {
      if (!params) {
        throw new Error('missing params');
      }
      var resource = $resource(kApiServer + "/user/accesstoken", {}, {
        'add': { method: 'POST' }
      });
      return new resource(params).$add()
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
    * Lists the access tokens for a user
    * @private
    */
    function list() {
      var resource = $resource(kApiServer + "/user/accesstoken", {});
      return new resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
    * Remove an access token for a user
    * @private
    */
    function remove(accessTokenId) {
      if (!accessTokenId) {
        throw new Error('missing accessTokenId');
      }
      var resource = $resource(kApiServer + '/user/accesstoken/' + accessTokenId, {});
      return new resource({}).$delete()
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // Client API
    return {
      add: add,
      list: list,
      remove: remove
    };
  }
]);
