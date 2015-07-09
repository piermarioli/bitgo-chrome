/**
 * @ngdoc service
 * @name ApprovalsAPI
 * @description
 * Manages the http requests dealing with a wallet's approval objects
 */
angular.module('BitGo.API.ApprovalsAPI', [])

.factory('ApprovalsAPI', ['$q', '$location', '$resource', 'UtilityService',
  function($q, $location, $resource, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * Updates a wallet's specific approval
    * @param {string} approvalId for the approval
    * @param {obj} object containing details needed to update the approval
    * @private
    */
    function update(approvalId, approvalData) {
      var resource = $resource(kApiServer + '/pendingapprovals/' + approvalId, {}, {
        update: { method: 'PUT' }
      });
      return new resource(approvalData).$update({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /** In-client API */
    return {
      update: update
    };
  }
]);
