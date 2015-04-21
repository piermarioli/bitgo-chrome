angular.module('BitGo.Enterprise.AuditLogActivityTileDirective', [])
/**
 * Manages the logic for ingesting an audit log item and outputting
 * the right template item to the DOM
 */
.directive('auditLogActivityTile', ['$compile', '$http', '$templateCache',
  function($compile, $http, $templateCache) {
    // Returns the template path to compile based on logItem.type
    var getTemplate = function(logItemType) {
      var template = '';
      switch(logItemType) {
        // User Auth
        case 'userSignup':
        case 'userLogin':
        case 'userFailedLogin':
        // Transactions
        case 'bitgoSigned':
        case 'createTransaction':
        case 'approveTransaction':
        case 'rejectTransaction':
        // Policy Changes
        case 'addPolicy':
        case 'changePolicy':
        case 'removePolicy':
        case 'approvePolicy':
        case 'rejectPolicy':
        // User Shares
        case 'addUser':
        case 'removeUser':
        case 'shareUser':
        case 'shareUserAccept':
        case 'shareUserCancel':
        case 'shareUserDecline':
        case 'approveUser':
        case 'rejectUser':
        // User Settings change
        case 'userSettingsChange':
        case 'userPasswordChange':
        case 'userPasswordReset':
        // Wallet Actions
        case 'createWallet':
        case 'removeWallet':
        case 'renameWallet':
        // Label Address
        case 'labelAddress':
        // Commenting
        case 'updateComment':
          template = 'enterprise/templates/activitytiles/' + logItemType + '.html';
          break;
        default:
          throw new Error('Expected valid audit log type. Got: ' + logItemType);
      }
      return template;
    };

    // Note:
    // We work in the link function because we need to specify the
    // template before compile time; then manually compile it once we have
    // data on the scope
    return {
      restrict: 'A',
      replace: true,
      link: function(scope, element, attrs) {
        function checkPolicyItem(logItemType) {
          switch(logItemType) {
            case 'addPolicy':
            case 'changePolicy':
            case 'removePolicy':
            case 'approvePolicy':
            case 'rejectPolicy':
              return true;
            default:
              return false;
          }
        }

        // Set pretty time for the ui
        scope.logItem.prettyDate = new moment(scope.logItem.date).format('MMMM Do YYYY, h:mm:ss A');
        // Bool for if the action is a policy item
        scope.logItem.isPolicyItem = checkPolicyItem(scope.logItem.type);
        // init the template
        $http.get(getTemplate(scope.logItem.type), {cache: $templateCache})
        .success(function(html) {
          element.html(html);
          $compile(element.contents())(scope);
        });
      }
    };
  }
]);
