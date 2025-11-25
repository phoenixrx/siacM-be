const express = require('express');
const router = express.Router();
const upload = require('../upload');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require("bcryptjs");
const { retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');
const { buildUpdateQuery } = require('../funciones/funciones_comunes_be');

// GET /api/configuraciones 
router.get('/datos-empresas/:id_cli',  authenticateToken, async (req,res)=> {
  const {id_cli} = req.params;
  if (!id_cli ) {
    return res.status(400).json({ error: 'Campos requeridos' });
  }
  
  let query_configs = `
        SELECT 
            pue.nombre,
            pue.apellidos,
            pue.cedula,
            "J" as tipo_cedula,            
            pue.direccion,
            pue.id_estado,
            pue.id_municipio,
            pue.id_ciudad,
            pue.id_parroquia,
            pue.id_usuario_empresa,
            pue.contacto,
            pue.correo,
            pue.web,
            pue.telefono,
            pue.fecha_valido,
            pue.logo_empresa,
            pue.logo2_empresa,
            pue.logo_perfil
        FROM  perfil_usuario_empresa pue 
        WHERE pue.id_usuario_empresa = ?;

  `;

    try {    
    const result = await retornarQuery(query_configs, [id_cli]);

    return res.json({
      success: true,
      datos: result
    });
    } catch (error) { 
        registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.patch('/datos-usuario-basico-empresa/:id_usuario',  authenticateToken, async (req,res)=> {
  const {id_usuario} = req.params;    
  const {id_estado, id_municipio, 
    id_ciudad, id_parroquia,  direccion, cedula, nombre, apellidos} = req.body;
  
  if (id_estado && isNaN(parseInt(id_estado))) {
    return res.status(400).json({ error: 'El ID de estado no es válido.' });
  }
  if (id_municipio && isNaN(parseInt(id_municipio))) {
    return res.status(400).json({ error: 'El ID de municipio no es válido.' });
  }
  if (id_ciudad && isNaN(parseInt(id_ciudad))) {
    return res.status(400).json({ error: 'El ID de ciudad no es válido.' });
  }
  if (id_parroquia && isNaN(parseInt(id_parroquia))) {
    return res.status(400).json({ error: 'El ID de parroquia no es válido.' });
  }

  const allowed =  [
    'nombre', 'apellidos', 'cedula', 
    'direccion', 'id_estado', 'id_municipio', 
    'id_ciudad', 'id_parroquia', 
  ];

   const whereConditions = {
      id_usuario_empresa: parseInt(id_usuario, 10)
    };
  const update = buildUpdateQuery('perfil_usuario_empresa', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }

  if (!id_usuario ) {
    registrarErrorPeticion(req, "Intento de actualizacion sin usuario ident");
    return res.status(400).json({ error: 'Campos requeridos' });    
  }
  
  try {    
    const result = await retornarQuery(update.query, update.values);
    return res.json({
      success: true,
      datos: result
    });
    } catch (error) { 
      registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.patch('/datos-usuario-empresa/:id_cli',  authenticateToken, async (req,res)=> {
  const {id_cli} = req.params;    

  const allowed =  [
    'web', 'correo', 'telefono', 'contacto'
  ];

   const whereConditions = {
      id_usuario_empresa: parseInt(id_cli, 10)
    };
  const update = buildUpdateQuery('perfil_usuario_empresa', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }

  if (!id_cli ) {
    registrarErrorPeticion(req, "Intento de actualizacion sin usuario ident");
    return res.status(400).json({ error: 'Campos requeridos' });    
  }
  
  try {    
    const result = await retornarQuery(update.query, update.values);
    return res.json({
      success: true,
      datos: result
    });
    } catch (error) { 
      registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.patch('/cambiar-logos',  authenticateToken, (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      registrarErrorPeticion(req, 'Campo de archivo inesperado');
      return res.status(400).json({ error: 'Campo de archivo inesperado' });
    }
    if (err) {
      registrarErrorPeticion(req, err.message);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { id_cli, logo_empresa, logo2_empresa, logo_perfil } = req.body;

    if (!id_cli) {
      registrarErrorPeticion(req, 'Empresa requerida' )
      return res.status(400).json({ error: 'Empresa requerida' });
    }

    if (!req.file) {
      registrarErrorPeticion(req, 'imagen requerida' )
      return res.status(400).json({ error: 'Imagen requerida' });
    }
    // Validar tamaño del archivo original
    let optimizedImageBuffer = req.file.buffer;
    let fileSizeInMB = req.file.size / (1024 * 1024);

    // Si pesa más de 5 MB, optimizamos
    if (fileSizeInMB > 5) {
      optimizedImageBuffer = await sharp(req.file.buffer)
        .resize({ width: 800 }) // Ajustar ancho máximo
        .jpeg({ quality: 70 })   // Compresión JPEG
        .png({ compressionLevel: 6 }) // Compresión PNG
        .toBuffer();
    }

    const updates = [];
    const params = [];
    let nombre ='nombre';
  // Solo añadir campos si están definidos (incluyendo 0 o false)
  if (logo_empresa !== undefined) {
    updates.push('logo_empresa = ?');    
    nombre = 'logo_empresa';
  }
  if (logo2_empresa !== undefined) {
    updates.push('logo2_empresa = ?');    
    nombre = 'logo2_empresa';
  }
  if (logo_perfil !== undefined) {
    updates.push('logo_perfil = ?');
    nombre = 'logo_perfil';
  }
  // Si no hay campos para actualizar
  if (updates.length === 0) {
    registrarErrorPeticion(req, 'No hay datos para actualizar')
    return res.status(400).json({
      success: false,
      error: 'No hay datos para actualizar'
    });
  }
 
  
  
  const ext = path.extname(req.file.originalname).toLowerCase();        
  const filename = `${id_cli}-${nombre}${ext}`;
  let valor = `../images/empresas/${filename}`  
  params.push(valor);
  params.push(id_cli);
  
  const uploadDir = '../../../siac.empresas.historiaclinica.org/images/empresas';   
  const uploadPath = path.resolve(__dirname, uploadDir, filename);
        
    fs.writeFileSync(uploadPath, optimizedImageBuffer);


  const queryUpdate = `
      UPDATE perfil_usuario_empresa
      SET ${updates.join(', ')}
      WHERE id_usuario_empresa = ?
    `;

    const resultado = await retornarQuery(queryUpdate, params);
  
    res.json({
        message: 'Foto de perfil actualizada correctamente',
        url: valor, 
        size: optimizedImageBuffer.length / (1024 * 1024)
      });

  } catch (error) {
    registrarErrorPeticion(req, error)    
    res.status(500).json({ error: error.message || 'Error al procesar la imagen' });
  }
});

router.get("/usuarios/:id_cli",  async (req, res) => {
  const { id_cli } = req.params;
  const {usuario } = req.query;
 
  if (!id_cli) {
    registrarErrorPeticion(req, 'Empresa no enviada')
    return res.status(400).json({ error: 'Empresa no enviada' });
  }
  let filtros ='';
  let params = [id_cli];
  if(usuario){
    filtros += " AND u.usuario LIKE '%?%'";
    params.push(usuario);
  } 

  let query = `
  SELECT 
        u.*,
        pub.*,
        gu.id_grupo_usuario,
        gu.descripcion as grupo_u,
        pue.id_usuario_empresa as id_cli,
        pue.fecha_valido as fecha_vencimiento,
        pue.logo_empresa,
        pue.logo2_empresa,
        pue.id_plan       
    FROM usuarios u
    INNER JOIN grupos_usuarios_det gud ON gud.id_usuario = u.id
    INNER JOIN grupos_usuarios gu ON gu.id_grupo_usuario = gud.id_grupo_usuario
    INNER JOIN perfil_usuario_basico pub ON pub.id_usuario = u.id
    INNER JOIN perfil_usuario_empresa pue ON pue.id_usuario_empresa = pub.id_usuario_empresa
    WHERE pub.id_usuario_empresa =? ${filtros} 
    ORDER BY u.usuario ASC
  `;

  try {
    const result = await retornarQuery(query, params);
    const usuarios = Array.isArray(result.data) 
      ? result.data 
      : Object.values(result.data); // Por si viene como { "0": {...}, "1": {...} }

    const usuariosSinContrasena = usuarios.map(user => {
      const { contrasena, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    return res.json({
      success: true,
      datos: usuariosSinContrasena
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });
  }
})

router.patch('/datos-usuarios/:id_usuario', authenticateToken,  async (req,res)=> {
  const {id_usuario} = req.params;    
  const {cedula, nombre, apellidos, id_estado, id_municipio, id_ciudad,
    id_zona, id_parroquia, fecha_nacimiento, direccion, id_especialista, activo, correoe} = req.body;
    
  if (!id_usuario ) {
    registrarErrorPeticion(req, "Intento de actualizacion sin usuario ident");
    return res.status(400).json({ error: 'Campos requeridos' });    
  }

  if (id_usuario && id_usuario==1 ) {
    registrarErrorPeticion(req, "Intento de actualizacion usuario master");
    return res.status(500).json({ error: 'Prohibido' });    
  }

  if (fecha_nacimiento) {
    const fechaNacimientoDate = new Date(fecha_nacimiento);
    if (isNaN(fechaNacimientoDate.getTime())) {
      return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
    }
  }
 
  if (id_estado && isNaN(parseInt(id_estado))) {
    return res.status(400).json({ error: 'El ID de estado no es válido.' });
  }
  if (id_municipio && isNaN(parseInt(id_municipio))) {
    return res.status(400).json({ error: 'El ID de municipio no es válido.' });
  }
  if (id_ciudad && isNaN(parseInt(id_ciudad))) {
    return res.status(400).json({ error: 'El ID de ciudad no es válido.' });
  }
  if (id_parroquia && isNaN(parseInt(id_parroquia))) {
    return res.status(400).json({ error: 'El ID de parroquia no es válido.' });
  }

  const allowed =  [
    'nombre', 'apellidos', 'cedula', 
    'direccion', 'id_estado', 'id_municipio', 
    'id_ciudad', 'id_zona', 'id_parroquia', 'fecha_nacimiento', 'id_especialista', 'correoe', 'activo'
  ];

   let whereConditions = {
      id_usuario: parseInt(id_usuario, 10),      
    };

  let tabla='perfil_usuario_basico';

  if(activo || correoe){
    tabla='usuarios';
    whereConditions = {
      id: parseInt(id_usuario, 10),      
    };
  }

  const update = buildUpdateQuery(tabla, allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }


  
  try {    
    const result = await retornarQuery(update.query, update.values);
    return res.json({
      success: true,
      datos: result
    });
    } catch (error) { 
      registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.patch('/datos-usuarios-grupo/:id_usuario', authenticateToken,  async (req,res)=> {
  const {id_usuario} = req.params;    
  const {id_grupo_usuario} = req.body;
    
  if (!id_usuario ) {
    registrarErrorPeticion(req, "Intento de actualizacion sin usuario ident");
    return res.status(400).json({ error: 'Campos requeridos' });    
  }

  if (id_usuario && id_usuario==1 ) {
    registrarErrorPeticion(req, "Intento de actualizacion usuario master");
    return res.status(401).json({ error: 'Prohibido' });    
  }

  let query = `
  UPDATE grupos_usuarios_det
  SET id_grupo_usuario = ?
  WHERE id_usuario = ?`;
  
  const params = [id_grupo_usuario, id_usuario];
  
  try {    
    const result = await retornarQuery(query, params);
    return res.json({
      success: true,
      datos: result
    });
    } catch (error) { 
      registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.post('/datos-usuarios/', authenticateToken, async (req, res) => {
  const {
    usuario, contrasena, id_grupo_usuario, nombre, apellidos, cedula, direccion,
    id_estado, id_municipio, id_zona, id_parroquia, fecha_nacimiento,
    id_especialista, id_cli, correoe
  } = req.body;

  if (!usuario || !contrasena || !id_grupo_usuario || !nombre || !apellidos || !cedula || !id_cli || !correoe) {
    registrarErrorPeticion(req, "Faltan campos obligatorios para crear el usuario");
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (fecha_nacimiento) {
    const fechaNacimientoDate = new Date(fecha_nacimiento);
    if (isNaN(fechaNacimientoDate.getTime())) {
      return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
    }
  }

  const ids = { id_estado, id_municipio, id_zona, id_parroquia };
  for (const [key, value] of Object.entries(ids)) {
    if (value && isNaN(parseInt(value))) {
      return res.status(400).json({ error: `El ${key} no es válido.` });
    }
  }

  try {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(contrasena, 10);

    const queryUsuario = `
      INSERT INTO usuarios (usuario, contrasena, correoe, estado, activo)
      VALUES (?, ?, ?, 'activo', '1')
    `;
    const resultUsuario = await retornarQuery(queryUsuario, [usuario, hash, correoe]);

    if (resultUsuario.error) {
      const errorMsg = typeof resultUsuario.error === 'string'
        ? resultUsuario.error
        : resultUsuario.error.message || 'Error desconocido';

      if (errorMsg.includes("Duplicate entry") && errorMsg.includes("for key 'usuario'")) {
        return res.status(409).json({ success: false, error: "El usuario ya existe" });
      }
      if (errorMsg.includes("Duplicate entry") && errorMsg.includes("for key 'correoe'")) {
        return res.status(409).json({ success: false, error: "El correo ya existe" });
      }
      throw new Error(errorMsg);
    }

    if (!resultUsuario.data?.insertId) {
      throw new Error('No se generó un ID de usuario');
    }
    const id_usuario_insertado = resultUsuario.data.insertId;

    const queryPerfil = `
      INSERT INTO perfil_usuario_basico (
        id_usuario, nombre, apellidos, cedula, direccion, id_estado, id_municipio, 
        id_zona, id_parroquia, fecha_nacimiento, id_especialista, id_usuario_empresa, tipo_usuario, status,
        pagina 
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'E', 'completo', 'https://siac.empresas.historiaclinica.org/')
    `;
    const resultPerfil = await retornarQuery(queryPerfil, [
      id_usuario_insertado, nombre, apellidos, cedula, direccion, id_estado, id_municipio,
      id_zona, id_parroquia, fecha_nacimiento, id_especialista, id_cli 
    ]);
     if (resultPerfil.error) {
        let queryEliminar = 'DELETE FROM usuarios WHERE id = ?';
        await retornarQuery(queryEliminar, [id_usuario_insertado]);
        return res.status(500).json({
          success: false,
          error: resultPerfil.error || 'Error interno al crear el usuario'
        });
     }
    
    const queryGrupo = `
      INSERT INTO grupos_usuarios_det (id_usuario, id_grupo_usuario)
      VALUES (?, ?)
    `;
    const resultGrupo = await retornarQuery(queryGrupo, [id_usuario_insertado, id_grupo_usuario]);

    return res.json({
      success: true,
      message: 'Usuario creado exitosamente',
      id_usuario: id_usuario_insertado,
      datos: {
        perfil: resultPerfil,
        grupo: resultGrupo
      }
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    console.error("Error en /datos-usuarios:", error); // Para depuración
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno al crear el usuario'
    });
  }
});

router.patch('/usuario-passw/:id_usuario', authenticateToken, async (req, res) => {

  const { id_usuario } = req.params;
  const { contrasena } = req.body;

  if (!id_usuario || !contrasena) {
    registrarErrorPeticion(req, "Faltan campos obligatorios para cambiar la contraseña");
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (id_usuario && id_usuario == 1) {
    registrarErrorPeticion(req, "Intento de actualizacion usuario master");
    return res.status(401).json({ error: 'Prohibido' });
  }

  try {
    const hash = bcrypt.hashSync(contrasena, 10);

    const query = `
      UPDATE usuarios
      SET contrasena = ?
      WHERE id = ?
    `;
    const result = await retornarQuery(query, [hash, id_usuario]);

    if (result.error) {
      throw new Error(result.error);
    }

    return res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
      datos: result
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno al cambiar la contraseña'
    });
  }

})

router.post('/tipos-internos/:id_cli', authenticateToken, async (req, res) => {
  const {descripcion, nota} = req.body

  if (!descripcion || !nota) { 
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const {id_cli} = req.params;
  if (!id_cli) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  let query = `
  INSERT INTO tipos_interno (descripcion, nota, id_cli, activo)
  VALUES (?, ?, ?, 1);`;

  try {
    const result = await retornarQuery(query, [descripcion, nota, id_cli]);
    if(result.error){
      throw new Error(result.error);
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.patch('/tipos-internos/:id_tipo', authenticateToken, async (req, res) => {
  const {id_tipo} = req.params;
  
  if (!id_tipo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const allowed =  [
    'descripcion', 'nota', 'activo'
  ];

   const whereConditions = {
      id_tipo_interno: parseInt(id_tipo, 10)
    };
  const update = buildUpdateQuery('tipos_interno', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }
  try {
    const result = await retornarQuery(update.query, update.values);
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.post('/formas-pago/:id_cli', authenticateToken, async (req, res) => {
  const {descripcion, id_moneda, is_credit, nota} = req.body
  const {id_cli} = req.params;
  if (!id_cli) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (!descripcion || !is_credit || !id_moneda) { 
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if(isNaN(id_moneda)||isNaN(is_credit) || isNaN(id_cli)){
    return res.status(400).json({ error: 'Campos no validos' });
  }


  let query = `
  INSERT INTO formas_pago (descripcion, nota, id_moneda, credito, id_cli, activo)
  VALUES (?, ?, ?, ?, ?, 1);`;

  try {
    const result = await retornarQuery(query, [descripcion, nota, id_moneda, is_credit, id_cli]);
    if(result.error){
      throw new Error(error);
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.patch('/formas-pago:id_forma', authenticateToken, async (req, res) => {
  const {id_forma} = req.params;
  
  if (!id_forma) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const allowed =  [
    'descripcion', 'nota', 'activo', 
  ];

    if(descripcion!== null && descripcion!== undefined && descripcion.trim()==''){
    return res.status(400).json({
      success:false,
      error:'La descripcion no puede estar vacia'
    });
  }

   const whereConditions = {
      id_forma_pago: parseInt(id_forma, 10)
    };
  const update = buildUpdateQuery('formas_pago', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }
  try {
    const result = await retornarQuery(update.query, update.values);
    if(result.error){
      return res.json({
      success: false,
      datos: result
    });
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.get('/formas-pago/:id_cli',  async (req, res) => {
  const {id_cli} = req.params;
   if (!id_cli) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if(isNaN(id_cli)){
    return res.status(400).json({ error: 'Campos no validos' });
  }
  
 

  let query = `SELECT 
    fp.id_forma_pago,
    m.descripcion AS moneda,
    m.id_moneda,
    fp.credito,
    fp.descripcion,
    fp.activo
FROM 
    formas_pago fp
INNER JOIN 
    monedas m ON fp.id_moneda = m.id_moneda
WHERE 
    fp.id_cli = ?;`;

  try {
    const result = await retornarQuery(query, [id_cli]);
    if(result.error){
      throw new Error(error);
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})


router.post('/empresas/:id_cli', authenticateToken, async (req, res) => {
  const {descripcion, direccion, rif, telefono} = req.body
  const {id_cli} = req.params;
  if (!id_cli) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if(isNaN(id_cli)){
    return res.status(400).json({ error: 'Campos no validos' });
  }
  if (!descripcion || !rif ) { 
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
if(descripcion!== null && descripcion!== undefined && descripcion.trim()==''){
    return res.status(400).json({
      success:false,
      error:'La descripcion no puede estar vacia'
    });
  }

if (direccion !== undefined && direccion !== null && direccion.trim() === '') {
  return res.status(400).json({
    success: false,
    error: 'La dirección no puede estar vacía'
  });
}

  if(telefono!== undefined && telefono !== null && telefono.trim()==''){
    return res.status(400).json({
      success:false,
      error:'El telefono no puede estar vacio'
    });
  }  
  if (!rif || !/^[A-Za-z]{1}\d{9}$/.test(rif)) {
    return res.status(400).json({
      success: false,
      error: 'El campo RIF es obligatorio y debe tener una letra seguida de 9 números.'
    });
  }

  if (rif) {
    const checkRifQuery = `SELECT id_empresa FROM empresas WHERE rif = ? AND id_cli=?`;
    const existingRif = await retornarQuery(checkRifQuery, [rif, id_cli]);    
    if (existingRif.data.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe una empresa con este RIF.'
      });
    }
  }

  let query = `
  INSERT INTO empresas (descripcion, direccion, rif, telefono, id_cli)
  VALUES (?, ?, ?, ?, ?);`;

  try {
    const result = await retornarQuery(query, [descripcion, direccion, rif, telefono, id_cli]);
    if(result.error){
      throw new Error(error);
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.patch('/empresas/:id_empresa',  async (req, res) => {
  const {id_empresa} = req.params;
  const {descripcion,direccion, activo, rif, telefono}=req.body;
  if (!id_empresa) {
    return res.status(400).json({ 
      success: false,
      error: 'Faltan campos obligatorios' 
    });
  }
  if(isNaN(id_empresa)){
    return res.status(400).json({
      success: false,
      error: 'Campos no validos'
    })
  }
  if (rif && !/^[A-Za-z]{1}\d{9}$/.test(rif)) {
    return res.status(400).json({
      success: false,
      error: 'El campo RIF debe tener una letra seguida de 9 números.'
    });
  }
  if (rif) {
    const checkRifQuery = `SELECT id_empresa FROM empresas WHERE rif = ?  AND id_empresa!=?`;
    const existingRif = await retornarQuery(checkRifQuery, [rif, id_empresa ]);
    if (existingRif.data.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe una empresa con este RIF.'
      });
    }
  }
  if(activo !== undefined && (activo !== 0 && activo !== 1)) {
    return res.status(400).json({
      success: false,
      error: 'El campo activo debe ser 0 o 1.'
    });
  }
  if(descripcion!== null && descripcion!== undefined && descripcion.trim()==''){
    return res.status(400).json({
      success:false,
      error:'La descripcion no puede estar vacia'
    });
  }

if (direccion !== undefined && direccion !== null && direccion.trim() === '') {
  return res.status(400).json({
    success: false,
    error: 'La dirección no puede estar vacía'
  });
}

  if(telefono!== undefined && telefono !== null && telefono.trim()==''){
    return res.status(400).json({
      success:false,
      error:'El telefono no puede estar vacio'
    });
  }  

  if(activo !== undefined && (activo !== 0 && activo !== 1)) {
    return res.status(400).json({
      success: false,
      error: 'El campo activo debe ser 0 o 1.'
    });
  }

  const allowed =  [
    'descripcion', 'direccion', 'activo', 'rif', 'telefono'
  ];

   const whereConditions = {
      id_empresa: parseInt(id_empresa, 10)
    };
  const update = buildUpdateQuery('empresas', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }
  try {
    const result = await retornarQuery(update.query, update.values);
    if(result.error){
      return res.json({
      success: false,
      datos: result
    });
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.post('/seguros/:id_cli', authenticateToken, async (req, res) => {
  const {descripcion, direccion, RIF, telefono} = req.body
  const {id_cli} = req.params;
  if (!id_cli) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if(isNaN(id_cli)){
    return res.status(400).json({ error: 'Campos no validos' });
  }
  if (!descripcion || !RIF || !telefono || !direccion) { 
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
if(descripcion!== null && descripcion!== undefined && descripcion.trim()==''){
    return res.status(400).json({
      success:false,
      error:'La descripcion no puede estar vacia'
    });
  }

if (direccion !== undefined && direccion !== null && direccion.trim() === '') {
  return res.status(400).json({
    success: false,
    error: 'La dirección no puede estar vacía'
  });
}

  if(telefono!== undefined && telefono !== null && telefono.trim()==''){
    return res.status(400).json({
      success:false,
      error:'El telefono no puede estar vacio'
    });
  }  
  if (!RIF || !/^[A-Za-z]{1}\d{9}$/.test(RIF)) {
    return res.status(400).json({
      success: false,
      error: 'El campo RIF es obligatorio y debe tener una letra seguida de 9 números.'
    });
  }

  if (RIF) {
    const checkRifQuery = `SELECT id_seguro FROM seguros WHERE RIF = ? AND id_cli=?`;
    const existingRif = await retornarQuery(checkRifQuery, [RIF, id_cli]);
    if (existingRif.data.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un seguro con este RIF.'
      });
    }
  }

  let query = `
  INSERT INTO seguros (descripcion, direccion, RIF, telefono, id_cli)
  VALUES (?, ?, ?, ?, ?);`;

  try {
    const result = await retornarQuery(query, [descripcion, direccion, RIF, telefono, id_cli]);
    if(result.error){
      throw new Error(error);
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

router.patch('/seguros/:id_seguro',  authenticateToken, async (req, res) => {
  const {id_seguro} = req.params;
  const {descripcion,direccion, activo, RIF, telefono}=req.body;
  if (!id_seguro) {
    return res.status(400).json({ 
      success: false,
      error: 'Faltan campos obligatorios' 
    });
  }
  if(isNaN(id_seguro)){
    return res.status(400).json({
      success: false,
      error: 'Campos no validos'
    })
  }
  if (RIF && !/^[A-Za-z]{1}\d{9}$/.test(RIF)) {
    return res.status(400).json({
      success: false,
      error: 'El campo RIF debe tener una letra seguida de 9 números.'
    });
  }
  if(activo !== undefined && (activo !== 0 && activo !== 1)) {
    return res.status(400).json({
      success: false,
      error: 'El campo activo debe ser 0 o 1.'
    });
  }
  if(descripcion!== null && descripcion!== undefined && descripcion.trim()==''){
    return res.status(400).json({
      success:false,
      error:'La descripcion no puede estar vacia'
    });
  }

if (direccion !== undefined && direccion !== null && direccion.trim() === '') {
  return res.status(400).json({
    success: false,
    error: 'La dirección no puede estar vacía'
  });
}

  if(telefono!== undefined && telefono !== null && telefono.trim()==''){
    return res.status(400).json({
      success:false,
      error:'El telefono no puede estar vacio'
    });
  }  

  if(activo !== undefined && (activo !== 0 && activo !== 1)) {
    return res.status(400).json({
      success: false,
      error: 'El campo activo debe ser 0 o 1.'
    });
  }

  const allowed =  [
    'descripcion', 'direccion', 'activo', 'RIF', 'telefono'
  ];

   const whereConditions = {
      id_seguro: parseInt(id_seguro, 10)
    };

  if (RIF) {
    const checkRifQuery = `SELECT id_seguro FROM seguros WHERE RIF = ? AND id_seguro!=?`;
    const existingRif = await retornarQuery(checkRifQuery, [RIF, id_seguro]);
    if (existingRif.data.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un seguro con este RIF.'
      });
    }
  }

  const update = buildUpdateQuery('seguros', allowed, req.body, whereConditions);
  if (!update) {
    registrarErrorPeticion(req, "No hay campos para actualizar");
      return res.json({
          success:false,
          datos:"No hay campos para actualizar"
        }); 
      }
  try {
    const result = await retornarQuery(update.query, update.values);
    if(result.error){
      return res.json({
      success: false,
      datos: result
    });
    }
    return res.json({
      success: true,
      datos: result
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.json({
      success: false,
      datos: error
    });    
  }
})

module.exports = router;