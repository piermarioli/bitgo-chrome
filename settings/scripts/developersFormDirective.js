/**
 * @ngdoc directive
 * @name DevelopersForm
 * @description
 * Manages the ui for adding/removing access tokens for the API
 */
angular.module('BitGo.Settings.DevelopersFormDirective', [])

.directive('developersForm', ['$rootScope', 'NotifyService', 'AccessTokensAPI',
  function($rootScope, NotifyService, AccessTokensAPI) {
    return {
      restrict: 'A',
      require: '^SettingsController',
      controller: ['$scope', function($scope) {

        console.log('test');

      }]
    };
  }
]);
