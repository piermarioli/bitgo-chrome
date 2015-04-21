angular.module('BitGo.API.ReportsAPI', [])
/*
  Notes:
  - This module is for managing all http requests for reports
*/
.factory('ReportsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService',
  function($q, $location, $resource, $rootScope, UtilityService) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    // local copy of the report range for all wallets
    var ranges;

    // Fetch the report range for a specific wallet based on a time step
    function getWalletReportRange(params) {
      var rangeParams = {
        stepType: params.stepType || 'month'
      };
      var resource = $resource(kApiServer + '/reports/' + params.walletAddress + '/range', {});
      return new resource.get(rangeParams).$promise
      .then(function(data) {
        ranges[params.walletAddress] = data.range;
        return data.range;
      });
    }

    // Get the report range for each wallet in a list of wallets
    // E.g.: all wallets in a specific enterprise
    // The time interval can be configured by stepType ('day' | 'month')
    function getAllWalletsReportRange(params) {
      if (!params.wallets) {
        throw new Error('Expect list of wallets when getting report range for a wallet group');
      }
      // Reset the local report range object
      ranges = {};

      // Fetch the report range for each wallet
      var fetches = [];
      _.forIn(params.wallets, function(wallet) {
        var walletData = {
          walletAddress: wallet.data.id,
          stepType: params.stepType || 'month'
        };
        fetches.push(getWalletReportRange(walletData));
      });
      // Return the ranges of report dates
      return $q.all(fetches)
      .then(
        function(data) {
          return ranges;
        },
        PromiseErrorHelper()
      );
    }

    // Get a specific report (based on params) for a specific wallet
    function getReport(params) {
      var resource = $resource(kApiServer + '/reports/' + params.walletAddress, {});
      return new resource.get(params).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    function init() {
      ranges = {};
    }
    init();

    // In-client API
    return {
      getAllWalletsReportRange: getAllWalletsReportRange,
      getReport: getReport
    };
  }
]);
