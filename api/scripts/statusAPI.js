/**
 * @ngdoc service
 * @name StatusAPI
 * @description
 * Manages the http requests dealing with server status/availability
 */
angular.module('BitGo.API.StatusAPI', [])

.factory('StatusAPI', ['$resource', 'UtilityService',
  function($resource, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * Check BitGo service status
    * @private
    */
    function ping() {
      var resource = $resource(kApiServer + '/ping', {});
      return new resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /** In-client API */
    return {
      ping: ping
    };
  }
]);
