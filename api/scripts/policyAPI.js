angular.module('BitGo.API.PolicyAPI', [])

.factory('PolicyAPI', ['$resource', '$rootScope', 'UtilityService',
  function($resource, $rootScope, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
    * Update a policy rule on specified wallet
    * @param params {Object} params for the the policy update
    * @private
    */
    function updatePolicyRule(params) {
      if (!params.rule || !params.bitcoinAddress) {
        throw new Error('invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + params.bitcoinAddress + '/policy/rule', {}, {
        'save': { method: 'PUT' }
      });
      return new resource.save(params.rule).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
    * Delete a policy rule on specified wallet
    * @param params {Object} params for the the policy update
    * @private
    */
    function deletePolicyRule(params) {
      if (!params.id || !params.bitcoinAddress) {
        throw new Error('invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/' + params.bitcoinAddress + '/policy/rule', { id: params.id });
      return new resource.delete().$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // In-client API
    return {
      updatePolicyRule: updatePolicyRule,
      deletePolicyRule: deletePolicyRule
    };
  }
]);
