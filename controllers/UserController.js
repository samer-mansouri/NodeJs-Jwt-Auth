const express = require('express');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


const { validateUser, initializeUser } = require('../helpers/UserHelpers')


let createUser = async (req, res) =>{
    
    const { error } = validateUser(
      {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: req.body.password
      }
    );
    if(error){
      //console.log(error);
      //console.log(error.message)
      res.status(400).send({"Error" : error.message})
    } else {
      let user = await User.findOne({ email:  req.body.email });
      if (user){
        res.status().status(409).send({'message': 'User with this email already exists ! '});
      } else {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);
        initializeUser(req.body.firstName, req.body.lastName,req.body.email, hash)
        .save((err, doc) => {
          if(!err){
            res.status(201).send({'message': 'User created with success !'});
          } else {
            res.status(500).send({"Error": "Internal Server Error"})
          }
        });
      }
    }
  
}


const handleLogin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ 'message': 'Email and password are required.' });

  const foundUser = await User.findOne({ email: email }).exec();
  console.log(foundUser)
  if (!foundUser) return res.sendStatus(401).send({"Error": "User not found"}); //Unauthorized 
  // evaluate password 
  else {
    const match = await bcrypt.compare(password, foundUser.password);
    if (match) {
        // create JWTs
        const accessToken = jwt.sign(
            {
                "UserInfo": {
                    "email": foundUser.email,
                }
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '180s' }
        );
        const refreshToken = jwt.sign(
            { "email": foundUser.email },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: '1d' }
        );
        // Saving refreshToken with current user
        foundUser.refreshToken = refreshToken;
        const result = await foundUser.save();
        console.log(result);

        res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'None', maxAge: 24 * 60 * 60 * 1000 }); //secure: true, 
        res.json({ accessToken });
    } else {
        res.sendStatus(401);
    }
  }
  
}

const handleLogout = async (req, res) => {
  // On client, also delete the accessToken

  const cookies = req.cookies;
  if (!cookies?.refreshToken) return res.sendStatus(204); //No content
  const refreshToken = cookies.jwt;

  // Is refreshToken in db?
  const foundUser = await User.findOne({ refreshToken }).exec();
  if (!foundUser) {
      res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'None', secure: true });
      return res.sendStatus(204);
  }

  // Delete refreshToken in db
  foundUser.refreshToken = '';
  const result = await foundUser.save();
  console.log(result);

  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'None', secure: true });
  res.sendStatus(204);
}

const handleRefreshToken = async (req, res) => {
  
  const cookies = req.headers.cookie.split("=")[1];
  console.log(req.headers.cookie.split("=")[1])
  if (!cookies) return res.sendStatus(401);
  const refreshToken = cookies;
  const foundUser = await User.findOne({ refreshToken }).exec();
  if (!foundUser) return res.sendStatus(403); //Forbidden 
  // evaluate jwt 
  jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
          if (err || foundUser.email !== decoded.email) return res.sendStatus(403);
          const accessToken = jwt.sign(
              {
                  "UserInfo": {
                      "username": decoded.username,
                  }
              },
              process.env.ACCESS_TOKEN_SECRET,
              { expiresIn: '180s' }
          );
          res.json({ accessToken })
      }
  );
}



  
  module.exports = {
    createUser,
    handleLogin,
    handleLogout,
    handleRefreshToken
  };