/**
 * @ngdoc service
 * @name jobsAPI
 * @description
 * This manages app API requests for listing jobs through the BitGo website
 */
angular.module('BitGo.API.JobsAPI', [])

.factory('JobsAPI', ['$resource', 'UtilityService',
  function($resource, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * List the jobs posted on the workable website
    * @private
    */
    function list() {
      var resource = $resource(kApiServer + "/jobs", {});
      return new resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // Client API
    return {
      list: list
    };
  }
]);
