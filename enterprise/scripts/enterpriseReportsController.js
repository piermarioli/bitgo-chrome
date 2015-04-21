/*
  Notes:
  - This controls the view for the enterprise wallet reporting page
*/
angular.module('BitGo.Enterprise.EnterpriseReportsController', [])

.controller('EnterpriseReportsController', ['$scope', '$rootScope', 'NotifyService',
  function($scope, $rootScope, Notify) {
    // The view viewStates within the enterprise reports section
    $scope.viewStates = ['monthly'];
    // The current view section
    $scope.state = undefined;
    // sets the template to use based on the section
    $scope.activityTemplateSource = null;

    // gets the view template based on the $scope's viewSection
    function getTemplate() {
      if (!$scope.state || _.indexOf($scope.viewStates, $scope.state) === -1) {
        throw new Error('Missing $scope.state');
      }
      var template;
      switch ($scope.state) {
        case 'monthly':
          template = 'enterprise/templates/reports-partial-monthly.html';
          break;
      }
      return template;
    }

    // Event Handlers
    // Watch for changes in the $scope's state and set the view's template
    var killStateWatch = $scope.$watch('state', function(state) {
      if (!state) {
        return;
      }
      $scope.activityTemplateSource = getTemplate();
    });

    // Clean up when the scope is destroyed
    $scope.$on('$destroy', function() {
      // remove listeners
      killStateWatch();
    });

    function init() {
      $rootScope.setContext('enterpriseReports');

      $scope.state = 'monthly';
      $scope.activityTemplateSource = getTemplate();
    }
    init();
  }
]);
