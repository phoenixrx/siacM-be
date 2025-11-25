const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { generateToken, authenticateLocal, authenticateGoogle } = require('./auth');
const router = express.Router();

// Configurar Passport con Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const user = await authenticateGoogle(email);
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  done(null, rows[0]);
});

// Ruta para iniciar sesión local

// Inicio de sesión con Google
router.get('/auth/google', passport.authenticate('google'));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`${process.env.FRONTEND_URL}/?token=${token}`);
  }
);



module.exports = router;