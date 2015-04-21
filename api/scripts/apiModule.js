/*
  About:
  - Deals with all the BitGo API requests
*/
angular.module('BitGo.API', [
  // Modules for BitGo.API composition
  'BitGo.API.AccessTokensAPI',
  'BitGo.API.ApprovalsAPI',
  'BitGo.API.AuditLogAPI',
  'BitGo.API.EnterpriseAPI',
  'BitGo.API.KeychainsAPI',
  'BitGo.API.LabelsAPI',
  'BitGo.API.MarketDataAPI',
  'BitGo.API.PolicyAPI',
  'BitGo.API.ReportsAPI',
  'BitGo.API.SettingsAPI',
  'BitGo.API.StatusAPI',
  'BitGo.API.TransactionsAPI',
  'BitGo.API.UserAPI',
  'BitGo.API.WalletsAPI',
  'BitGo.API.WalletSharesAPI',
  // Dependencies for this module
  'BitGo.Model',
  'BitGo.Utility'
]);
