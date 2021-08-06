 const Sequelize = require("sequelize");

const sequelize = require("../utils/sql_database");


const Distributor = sequelize.define("distributor", {
    id: {
        type:Sequelize.INTEGER,
        primaryKey:true,
        allowNull:false,
        autoIncrement:true
    },

    distributorId: {
        type:Sequelize.STRING,
        allowNull: false,
    },
    businessName: {
        type:Sequelize.STRING,
        allowNull: false,

    },
    contactId:{
        type:Sequelize.STRING,
        unique:true,
        allowNull: false,
    },
    emailId:{
        type:Sequelize.STRING,
        allowNull: false,
    },
    status:{
        type:Sequelize.STRING,
        allowNull:false,
        defaultValue: 'CREATED'
    },
    initialActivationDate:{
        type:Sequelize.STRING,
    },
    pin:{
        type:Sequelize.STRING,
        allowNull:false,
    },
    margin:{
        type:Sequelize.FLOAT,
        allowNull: false,
    },
    territoryCode: {
        type:Sequelize.STRING,
        allowNull:false
    },
    cashValue:{
        type:Sequelize.FLOAT,
        allowNull:false,
        defaultValue:0

    }

});
 const Retailor = sequelize.define("retailor", {
     id: {
         type:Sequelize.INTEGER,
         primaryKey:true,
         allowNull:false,
         autoIncrement:true
     },
     firstName:{
         type:Sequelize.STRING,
         allowNull: false,
     },
     lastName:{
         type:Sequelize.STRING,
         allowNull: false,
     },
     retailorId:{
         type:Sequelize.STRING,
         allowNull: false,
     },
     businessName: {
         type:Sequelize.STRING,
     },
     contactId:{
         unique:true,
         type:Sequelize.STRING,
         allowNull: false,
     },
     status:{
         type:Sequelize.STRING,
         allowNull:false,
         defaultValue: 'CREATED'
     },
     pin:{
         type:Sequelize.STRING,
         allowNull:false,

     },
     initialActivationDate:{
         type:Sequelize.STRING,
     },
     margin:{
         type:Sequelize.FLOAT,
         allowNull: false,
     },
     cashValue:{
         type:Sequelize.FLOAT,
         allowNull:false,
         defaultValue:0
     }

 });


module.exports = {Distributor, Retailor}
