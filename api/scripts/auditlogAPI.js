angular.module('BitGo.API.AuditLogAPI', [])

.factory('AuditLogAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService',
  function($q, $location, $resource, $rootScope, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    // Get the audit log based on scoping provided in the params
    function get(params) {
      if (!params || !params.enterpriseId ||
          typeof(params.skip) !== 'number' ||
          typeof(params.limit) !== 'number') {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + "/auditlog", {});
      return resource.get(params).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // In-client API
    return {
      get: get
    };
  }
]);
