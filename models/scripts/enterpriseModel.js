// Model for Enterprises
angular.module('BitGo.Models.EnterpriseModel', [])

.factory('EnterpriseModel', ['$rootScope',
  function($rootScope) {
    // Constant to define the 'personal' enterprise
    // Note: everything is scoped to an enterprise; thus wallets without
    // an enterprise (personal wallets) can be grouped under the 'personal' enterprise
    var PERSONAL_ENTERPRISE = {
      id: 'personal',
      name: 'Personal',
      primaryContact: '',
      emergencyPhone: ''
    };

    // If there is no enterprise info passed in, it means we're
    // creating the `personal` enterprise object
    var personalEnterpriseData = PERSONAL_ENTERPRISE;

    // Enterprise Constructor
    function Enterprise(enterpriseData) {
      var data = enterpriseData || personalEnterpriseData;
      this.name = data.name;
      this.id = data.id;
      this.primaryContact = data.primaryContact;
      this.emergencyPhone = data.emergencyPhone;
      this.isPersonal = (this.id === PERSONAL_ENTERPRISE.id && this.name === PERSONAL_ENTERPRISE.name);
      this.walletCount = 0;
      this.balance = 0;
      this.walletShareCount = {
        incoming: 0,
        outgoing: 0
      };
    }

    /**
     * Set the enterprise's overall balance based on all wallets
     * @param wallets {Object} collection of BitGo client wallet objects
     * @public
     */
    Enterprise.prototype.setBalance = function(wallets) {
      if (!wallets) {
        throw new Error('Missing wallets');
      }
      // build the balance for the enterprise
      function buildBalance(wallets) {
        if (!wallets) {
          return;
        }
        // Build the bitcoin balance
        return _.reduce(wallets, function(sum, wallet) {
          return sum + wallet.data.balance;
        }, 0);
      }
      var filteredWallets = {};
      var self = this;
      _.forIn(wallets, function(wallet) {
        var personalMatch = (self.id === PERSONAL_ENTERPRISE.id) && !wallet.data.enterprise;
        var enterpriseMatch = wallet.data.enterprise === self.id;
        if (personalMatch || enterpriseMatch) {
          filteredWallets[wallet.data.id] = wallet;
        }
      });
      self.balance = buildBalance(filteredWallets);
    };

    /**
     * Set the wallet count on the enterprise
     * @param wallets {Object} collection of BitGo client wallet objects
     * @public
     */
    Enterprise.prototype.setWalletCount = function(wallets) {
      if (!wallets) {
        throw new Error('Missing wallets');
      }
      var self = this;
      self.walletCount = 0;
      _.forIn(wallets, function(wallet) {
        var personalMatch = (self.id === PERSONAL_ENTERPRISE.id) && !wallet.data.enterprise;
        var enterpriseMatch = wallet.data.enterprise === self.id;
        if (personalMatch || enterpriseMatch) {
          self.walletCount++;
        }
      });
    };

    /**
     * Set the wallet count on the enterprise
     * @param wallets {Object} collection of BitGo client wallet objects
     * @public
     */
    Enterprise.prototype.setWalletShareCount = function(walletShares) {
      if (!walletShares) {
        throw new Error('Missing wallet shares');
      }
      var self = this;
      self.walletShareCount = {
        incoming: 0,
        outgoing: 0
      };

      _.forIn(walletShares.incoming, function(walletShare) {
        var personalMatch = (self.id === PERSONAL_ENTERPRISE.id) && !walletShare.enterprise;
        var enterpriseMatch = walletShare.enterprise === self.id;
        if (personalMatch || enterpriseMatch) {
          self.walletShareCount.incoming++;
        }
      });

      _.forIn(walletShares.outgoing, function(walletShare) {
        var personalMatch = (self.id === PERSONAL_ENTERPRISE.id) && !walletShare.enterprise;
        var enterpriseMatch = walletShare.enterprise === self.id;
        if (personalMatch || enterpriseMatch) {
          self.walletShareCount.outgoing++;
        }
      });
    };

    // Decorator: Adds users to the enterprise object (based on all wallets
    // associated with the enterprise)
    Enterprise.prototype.setUsers = function(wallets) {
      var result = {};
      var hasUsers = false;
      _.forIn(wallets, function(wallet) {
        // If the wallet has an array of users on it, then it is shared
        if (wallet.data.admin && wallet.data.admin.users) {
          hasUsers = true;
          // Build a user object keyed into with userIds
          _.forEach(wallet.data.admin.users, function(user) {
            if (!result[user.user]) {
              result[user.user] = [];
            }
            result[user.user].push({
              walletId: wallet.data.id,
              walletLabel: wallet.data.label,
              permissions: user.permissions
            });
          });
        }
        // If the user is admin but the wallet does not have users
        else if (wallet.data.admin) {
          hasUsers = true;
          if (!result[$rootScope.currentUser.settings.id]) {
            result[$rootScope.currentUser.settings.id] = [];
          }
          result[$rootScope.currentUser.settings.id].push({
            walletId: wallet.data.id,
            walletLabel: wallet.data.label,
            permissions: "admin,spend,view"
          });
        }
      });
      if (hasUsers) {
        this.users = result;
      }
    };

    /**
    * Decorator: Adds approvals to the enterprise object (based on all wallets
    * associated with the enterprise)
    * @param wallets {Object} all wallets associated with this enterprise
    * @returns {Int} num of keys in the enterprise's pending approval object
    * @public
    */
    Enterprise.prototype.setApprovals = function(wallets) {
      var result = {};
      _.forIn(wallets, function(wallet) {
        var approvals = wallet.data.pendingApprovals;
        if (approvals) {
          // Build the enterprise's pendingApprovals array
          _.forEach(approvals, function(approval) {
            result[approval.id] = approval;
          });
        }
      });
      this.pendingApprovals = result;
      return _.keys(this.pendingApprovals).length;
    };

    /**
    * remove the pending approval from the enterprise
    * @param {String} approval id to remove
    * @public
    */
    Enterprise.prototype.deleteApproval = function(approvalId) {
      if (!this.pendingApprovals) {
        return;
      }
      delete this.pendingApprovals[approvalId];
    };

    return {
      Enterprise: Enterprise
    };
  }
]);
