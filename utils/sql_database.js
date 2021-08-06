const Sequelize = require("sequelize");

const sequelize = new Sequelize("ussd_DISTRIBUTOR","mme", "mme",{
    dialect:"mysql",
    host:"localhost",

    define: {
        freezeTableName:true
    }
});

module.exports = sequelize;

