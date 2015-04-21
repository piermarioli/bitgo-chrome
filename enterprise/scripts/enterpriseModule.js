/*
  About:
  - Handles all functionality for a BitGo Enterprise (e.g dealing with
  wallet lists, enterprise settings, etc...)
*/
angular.module('BitGo.Enterprise', [
  // Modules for BitGo.Enterprise composition
  // Wallets Section
  'BitGo.Enterprise.EnterpriseWalletsController',
  'BitGo.Enterprise.MarketWidgetDirective',
  // Activity Section
  'BitGo.Enterprise.EnterpriseActivityController',
  'BitGo.Enterprise.ActivityAuditLogDirective',
  'BitGo.Enterprise.ActivityApprovalsDirective',
  'BitGo.Enterprise.AuditLogActivityTileDirective',
  'BitGo.Enterprise.EnterpriseApprovalTileDirective',
  // Settings Section
  'BitGo.Enterprise.EnterpriseSettingsController',
  'BitGo.Enterprise.PersonalSettingsController',
  'BitGo.Enterprise.SettingsUsersManagerDirective',
  'BitGo.Enterprise.SettingsAddUserFormDirective',
  // Reports Section
  'BitGo.Enterprise.EnterpriseReportsController',
  'BitGo.Enterprise.MonthlyReportsDirective'
]);
