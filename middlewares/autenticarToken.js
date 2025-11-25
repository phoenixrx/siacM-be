const express = require('express');
const { retornar_query } = require('../auth');
const jwt = require('jsonwebtoken');
const tokenBlacklist = new Set();

function authenticateToken(req, res, next) {
  const publicRoutes = [
    '/login',
    '/images/*',
    '/login/',
    '/login/index.html',
    '/',
    '/php'
  ];
 
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (publicRoutes.some(route => {
    if (route.endsWith('*')) {
      return req.path.startsWith(route.slice(0, -1));
    }
    return req.path === route;
  })) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token no proporcionado', redirectTo: '/login' });
  }

  const token = authHeader.split(' ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Formato de token inválido', redirectTo: '/login' });
  }

  // Verificar si el token está en la lista negra (blacklist)
  if (tokenBlacklist && tokenBlacklist.has(token)) {
    return res.status(401).json({ error: 'Token invalidado', redirectTo: '/login' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
     
const requestId = Date.now() + Math.random();
const requestQuery = Object.keys(req.query).length > 0 
  ? JSON.stringify(req.query) 
  : null;
    
    req.requestId = requestId;
    req.logData = {
      id_log_acceso: requestId,
      id_usuario: decoded.id_usuario,
      ip_origen: req.ip || req.headers['x-forwarded-for'] || decoded.ip_internet,
      metodo: req.method,
      ruta: req.path,
      user_agent: req.headers['user-agent'],
      request_body: req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE' || req.method === 'PUT' 
        ? JSON.stringify(req.body) 
        : null,
      requestQuery:requestQuery || '{}'
    };
    setTimeout(() => {
      // ✅ Registrar inicio de petición
      registrarInicioPeticion(req.logData)
      .then(logId => {
        req.logId = logId; // opcional: guardarlo para después
      })
      .catch(err => {
        console.error('[LOG] Error al registrar inicio (no bloquea):', err.message);
      });
    }, 10);
    

    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'El token ha expirado', redirectTo: '/login' });
    }
    return res.status(401).json({ error: 'Token inválido', redirectTo: '/login' });
  }
} 

async function registrarInicioPeticion(logData) {
  const query = `
    INSERT INTO logs_peticiones 
    (id_log_acceso, id_usuario, ip_origen, metodo, ruta, request_body, user_agent, request_query)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  try {
    const result = await retornar_query(query, [
      logData.id_log_acceso,
      logData.id_usuario,
      logData.ip_origen,
      logData.metodo,
      logData.ruta,
      logData.request_body,
      logData.user_agent, 
      logData.requestQuery
    ]);
    return result.insertId; // Devuelve el ID para usarlo después
  } catch (error) {    
    console.error('[LOG] No se pudo insertar en logs_peticiones:', error.message);
    
    return null; // No detiene nada
  }
}
async function registrarErrorPeticion(req, error) {
  
  let errorApi = error.message ? error.message : error;

  if(errorApi=='TokenExpiredError'){
    return;
  }
    const requestQuery = Object.keys(req.query).length > 0 
      ? JSON.stringify(req.query) 
      : null;       
    const request_body= req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE' || req.method === 'PUT' 
        ? JSON.stringify(req.body) 
        : null
    
      try {
          await retornar_query(`
          INSERT INTO logs_errores
            (error,origen, body, query, ip_origen) VALUES (?,?,?,?,?)`, [errorApi,req.path, request_body, requestQuery, req.ip]);
            
      } catch (error) {
        
      }
 
}

async function registrarFinPeticion(logId) {
  await retornar_query(`
    UPDATE logs_peticiones 
    SET status = 'completado', fecha_fin = NOW(), duracion_ms = TIMESTAMPDIFF(MICROSECOND, fecha_inicio, NOW()) / 1000
    WHERE id = ?
  `, [logId]);
}

module.exports =  {authenticateToken, registrarInicioPeticion, registrarErrorPeticion, registrarFinPeticion};
