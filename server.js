require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { retornar_query, retornarQuery } = require('./auth');
const  { authenticateToken, registrarInicioPeticion, registrarErrorPeticion, registrarFinPeticion} = require('./middlewares/autenticarToken');
const { generateToken, authenticateLocal } = require('./auth');
const routes = require('./routes');
const { validatePatientCed, crearPaciente, actualizarPaciente } = require('./schemas/pacientes');
const { validateLocalidad } = require('./schemas/localidades');
const { validateHonorariosConfig, actualizarHonorariosConfig } = require('./schemas/honorarios');
const { registrarCita } = require('./schemas/agenda');
const { registrarAdmision, registrarDetalleAdmision,actualizarAdmision } = require('./schemas/admision');
const { registrarOdontolProcedure, actualizarOdontolProcedure } = require('./schemas/odontol');
const { generarUUID } = require('./funciones/funciones_comunes_be');
const contenedor_query = require('./queries');
const rateLimit = require('express-rate-limit');
const app = express();
exports.app = app;
const PORT = process.env.PORT || 3000;
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment');
const https = require('https');
const { query } = require('./db');
const upload = require('./upload');
const sharp = require('sharp');
const fs = require('fs'); 
const multer = require('multer');
const admin = require('firebase-admin');
const serviceAccount = require('./siacmedica-firebase-service-account.json');
const uploadRoutes = require('./funciones/upload');
const presupuestosRoutes = require('./routes/presupuestos');
const reportesRoutes = require('./routes/reportes');
const honorariosRoutes = require('./routes/honorarios');
const portalMedicoRoutes = require('./routes/portal_medico');
const recibosRoutes = require('./routes/recibos');
const cajasRoutes = require('./routes/caja');
const headerRoutes = require('./routes/header');
const controlGastosRoutes = require('./routes/control_gastos');
const inventariosRoutes = require('./routes/inventarios');
const antecedentesRoutes = require('./routes/antecedentes');
const admisionesRoutes = require('./routes/admisiones');
const configuracionesRoutes = require('./routes/configuraciones');
const pacientesRoutes = require('./routes/pacientes');
const pagosRoutes = require('./routes/pagos');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


async function enviarNotificacionOneSignal(oneSignalUserId, titulo, mensaje, data = {tipo: "nueva_cita"}, large_icon="https://siac.empresas.historiaclinica.org/images/splash-icon.png") {

  if (!oneSignalUserId || typeof oneSignalUserId !== 'string') {
    console.error('❌ OneSignal userId inválido:', oneSignalUserId);
    return { success: false, error: 'OneSignal userId inválido' };
  }

  const payload = {
    app_id: '131421fb-71e5-462a-a575-c3f2be35e848',
  
  include_aliases: { onesignal_id: [
    `${oneSignalUserId}`
  ]},target_channel: "push",

    headings: { en: titulo },
    contents: { en: mensaje },
    data, large_icon
  };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications ', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic os_v2_app_cmkcd63r4vdcvjlvypzl4npijdtomdkey4geyvfb7nevd5qydgjtv6k3t6o26oird2xh4wvusc7pwoon4m2fd2in6av6kufhb7juroa'
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn('⚠️ Error al enviar notificación:', data);
      return { success: false, error: data.errors?.join(', ') || 'Error en API de OneSignal' };
    }

    return { success: true, data };

  } catch (error) {
    
    return { success: false, error: error.message };
  }
}

//app.set('trust proxy', true);
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({extended:false}));



app.use('/api/control_gastos', presupuestosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/honorarios', honorariosRoutes);
app.use('/api/portal_medico', portalMedicoRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/recibos', recibosRoutes);
app.use('/api/caja', cajasRoutes);
app.use('/api', headerRoutes);
app.use('/api/control_gastos', controlGastosRoutes);
app.use('/api/inventarios', inventariosRoutes);
app.use('/api/antecedentes', antecedentesRoutes);
app.use('/api/admisiones', admisionesRoutes);
app.use('/api/configuraciones', configuracionesRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/pagos', pagosRoutes);

const crearCitaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // Ventana de tiempo: 10 minutos
  max: 10, // Límite máximo de solicitudes por IP durante la ventana de tiempo
  message: 'Demasiadas solicitudes para crear citas. Por favor, inténtalo más tarde.',
  standardHeaders: true, // Agrega encabezados `RateLimit-*` a las respuestas
  legacyHeaders: false, // Desactiva los encabezados `X-RateLimit-*` antiguos
});

async function obtenerTasasBCV() {
  const url = 'https://www.bcv.org.ve/';
  const agent = new https.Agent({  
    rejectUnauthorized: false
  });
  try {
    // Configurar headers para simular navegador
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    };

    // Hacer la petición HTTP
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Cargar el HTML en Cheerio
    const $ = cheerio.load(response.data);
    
    const extraerTasa = (idDiv) => {
      const tasaTexto = $(`#${idDiv} .centrado strong`).text().trim();
      return tasaTexto.replace(',', '.').replace(/\s/g, '');
    };

    const fechaActualizacion = $('.date-display-single').attr('content');
    const fechaFormateada = moment(fechaActualizacion).format('DD/MM/YYYY HH:mm:ss');
 
    const tasas = {
      USD: extraerTasa('dolar'),
      EUR: extraerTasa('euro'),
      CNY: extraerTasa('yuan'),
      TRY: extraerTasa('lira'),
      RUB: extraerTasa('rublo')
    };
 
    const resultado = {
      fecha_actualizacion: fechaFormateada,
      fuente: 'BCV',
      tasas: tasas,
      detalles: {
        USD: { moneda: 'Dólar Estadounidense', simbolo: 'USD' },
        EUR: { moneda: 'Euro', simbolo: 'EUR' },
        CNY: { moneda: 'Yuan Chino', simbolo: 'CNY' },
        TRY: { moneda: 'Lira Turca', simbolo: 'TRY' },
        RUB: { moneda: 'Rublo Ruso', simbolo: 'RUB' }
      }
    }; 
    
    return resultado;
    
  } catch (error) {     
    try {      
      return await obtenerTasaBanesco();
    } catch (errorBanesco) {      
      return {
        error: true,
        mensaje: 'No se pudieron obtener tasas de ninguna fuente',
        detalle: errorBanesco.message
      };
    }
  }
}

async function obtenerTasaBanesco() {
  const url = 'https://www.banesco.com/informacion-de-interes/sistema-mercado-cambiario/';
  
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const tablas = $('table.formatted-table');
    
    if (tablas.length === 0) {
      throw new Error('No se encontró la tabla de tasas en Banesco');
    }

    let tasaUSDVenta = '';
    let tasaEURVenta = '';

    // Procesar cada tabla
    tablas.each((tablaIndex, tabla) => {
      const tituloTabla = $(tabla).find('thead td').text().trim();      

      $(tabla).find('tbody tr').each((filaIndex, row) => {
        const celdas = $(row).find('td');
        
        if (celdas.length >= 3) {
          const divisa = $(celdas[0]).text().trim();
          const compra = $(celdas[1]).text().trim();
          const venta = $(celdas[2]).text().trim();

          if (tituloTabla.includes('Menudeo')) {
            if (divisa === 'USD' && !tasaUSDVenta) {
              tasaUSDVenta = venta.replace(',', '.').replace(/\s/g, '').replace(/[^\d.]/g, '');

            } else if (divisa === 'EUR' && !tasaEURVenta) {
              tasaEURVenta = venta.replace(',', '.').replace(/\s/g, '').replace(/[^\d.]/g, '');

            }
          }
        }
      });
    });

    if (!tasaUSDVenta) {

      tablas.each((tablaIndex, tabla) => {
        $(tabla).find('tbody tr').each((filaIndex, row) => {
          const celdas = $(row).find('td');
          if (celdas.length >= 3) {
            const divisa = $(celdas[0]).text().trim();
            const venta = $(celdas[2]).text().trim();
            
            if (divisa === 'USD' && !tasaUSDVenta) {
              tasaUSDVenta = venta.replace(',', '.').replace(/\s/g, '').replace(/[^\d.]/g, '');
            } else if (divisa === 'EUR' && !tasaEURVenta) {
              tasaEURVenta = venta.replace(',', '.').replace(/\s/g, '').replace(/[^\d.]/g, '');
            }
          }
        });
      });
    }

    const fechaActualizacion = moment().format('DD/MM/YYYY HH:mm:ss');
    
    const resultado = {
      fecha_actualizacion: fechaActualizacion,
      fuente: 'Banesco',
      tasas: {
        USD: tasaUSDVenta || 'No disponible',
        EUR: tasaEURVenta || 'No disponible',
        CNY: 'No disponible en Banesco',
        TRY: 'No disponible en Banesco',
        RUB: 'No disponible en Banesco'
      },
      detalles: {
        USD: { 
          moneda: 'Dólar Estadounidense', 
          simbolo: 'USD', 
          tipo: 'Venta',
          categoria: 'Menudeo'
        },
        EUR: { 
          moneda: 'Euro', 
          simbolo: 'EUR', 
          tipo: 'Venta',
          categoria: 'Menudeo'
        },
        CNY: { moneda: 'Yuan Chino', simbolo: 'CNY' },
        TRY: { moneda: 'Lira Turca', simbolo: 'TRY' },
        RUB: { moneda: 'Rublo Ruso', simbolo: 'RUB' }
      },
      nota: 'Tasas de venta - Menudeo obtenidas de Banesco'
    };
   
    return resultado;
    
  } catch (error) {
    
    return {
      error: true,
      mensaje: 'Error al obtener datos de Banesco',
      detalle: error.message
    };
  }
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // 10 intentos cada 5 minutos
  message: "Demasiados intentos. Inténtalo de nuevo en 5 minutos.",
  standardHeaders: true,
  legacyHeaders: false,
});

const loginMasterLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutos
  max: 3, // 3 intentos cada minuto
  message: "Demasiados intentos. Inténtalo de nuevo en 5 minutos.",
  standardHeaders: true,
  legacyHeaders: false,
});

const pacientesApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 10, // 5 requests por minuto
  message: 'Límite de API excedido. Inténtalo de nuevo en 1 minuto.',
});

const loginRateMax = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // 20 requests por minuto
  message: 'Límite de API excedido. Inténtalo de nuevo en 1 minuto.',
});


const pacientesUpdateApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60, // 5 requests por minuto
  message: 'Límite de API excedido. Inténtalo de nuevo en 1 minuto.',
});
app.post('/crear-paciente', pacientesApiLimiter, async (req, res) => {
  const result = await crearPaciente(req.body);
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }
  const uuid = await generarUUID(); 
  let query_pac = `INSERT INTO pacientes
                      (tipo_cedula,
                      cedula,
                      apellidos, 
                      nombres,
                      telef1,
                      sexo,
                      correo,
                      fecha_nacimiento, direccion, uuid_paciente)                     
                  VALUES (?,?,?,?,?,?,?,?,?, '${uuid}')`;
try {
  
  let paciente = await retornar_query(query_pac, [filtros.tipo_cedula, filtros.cedula, filtros.apellidos, filtros.nombres, filtros.telef1, filtros.sexo, filtros.correo, filtros.fecha_nacimiento, filtros.direccion]);
  //console.log(paciente)
  if(!paciente.insertId){
    if(paciente.code=='ER_DUP_ENTRY'){
      return res.json({ success:false,
                        error: "La cedula y el tipo ya existe"
                      });
    }
    
  }
  res.json({ id_paciente: paciente.insertId,
            uuid_paciente: uuid
   });
  
} catch (error) {  
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: error });
  return
}
});
app.post('/api/crear-cita', crearCitaLimiter, async (req, res) => {
  const result = await registrarCita(req.body);
  
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }
  
  let query_pac = `INSERT INTO calendarios
                      (tipo_consulta,
                      color,
                      status_ag,
                      borderColor,
                      id_cli,
                      title,
                      descripcion, 
                      id_paciente,
                      id_medico,
                      start,
                      end)                     
                  VALUES ('P','#198754','Pendiente','#ffc107',(SELECT id_usuario FROM perfil_usuario_basico WHERE apellidos = ?),?,?,?,?,?,?)`;
  try {  
    let cita = await retornar_query(query_pac, [filtros.id_cli, filtros.title, 
        filtros.nota, filtros.id_paciente, filtros.id_med, filtros.fecha_inicio, filtros.fecha_fin]);
    res.json({ id_cita: cita.insertId });    
  } catch (error) {     
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error });
    return
  }
});

app.patch('/actualizar-paciente', pacientesUpdateApiLimiter, async (req, res) => {
  const result = await actualizarPaciente(req.query);
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }
  var valor_actualizable =''
  switch (filtros.campo) {
    case 'correo':
      valor_actualizable = filtros.correo
      break;
    case 'telef1':
      valor_actualizable = filtros.telef1
      break;
    
    default:
      break;
  }


  let query_pac = `UPDATE pacientes SET ${filtros.campo}='${valor_actualizable}'
                  WHERE id_paciente=?`;
try {
  
  let paciente = await retornar_query(query_pac, [filtros.id_paciente]);

  res.json({ cantidad_rows: paciente.affectedRows });
  
} catch (error) {    
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: 'No existe paciente' });
  return
}
});

app.get('/api/doctors', async (req, res) => {
  const { clinic_id,medic_id } = req.query; 
  let id = '';
  let logo ='';
  let filtro_clinica = (isNaN(clinic_id)) ?  `pue.apellidos= ?  ` : `pue.id_usuario_empresa =? `

  let nombre_clinica = clinic_id.toLocaleUpperCase();
  let query_ag = `SELECT pue.id_usuario_empresa,
                      pue.logo_empresa
                  FROM perfil_usuario_empresa pue
                  WHERE 
                    ${filtro_clinica}
                    LIMIT 1;`;
  try {
    let ids = await retornar_query(query_ag, [nombre_clinica]);
    id = ids.map(item => item.id_usuario_empresa);
    logo = ids[0].logo_empresa;
  } catch (error) {
registrarErrorPeticion(req, error)  
    res.status(500).json({ error: 'Clinica Invalida' });
    return
  }
  let medico = (medic_id==null || medic_id=='' || isNaN(medic_id))?'':`m.id_medico = ${medic_id} AND `

  

  try {
    const query = `
      SELECT 
          m.id_medico,
          m.sexo,
          CONCAT(m.nombre, ' ', m.apellido) AS name,
          m.titulo,
          mc.id_cli,
          mc.foto,
          mc.duracion,
          mc.max_seguro,
          e.descripcion AS specialty,
          cc.dias_semana,
          cc.hora_inicio,
          cc.hora_fin
      FROM 
          medicos m
      INNER JOIN 
          medicos_clinicas mc ON m.id_medico = mc.id_med
      LEFT JOIN 
          med_esp me ON m.id_medico = me.id_medico
      LEFT JOIN 
          especialidades e ON me.id_especialidad = e.id_especialidad
      LEFT JOIN (
          SELECT 
              id_externa,
              GROUP_CONCAT(DISTINCT CASE 
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 0 THEN 'Dom'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 1 THEN 'Lun'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 2 THEN 'Mar'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 3 THEN 'Mie'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 4 THEN 'Jue'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 5 THEN 'Vie'
                  WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 6 THEN 'Sab'
                  ELSE ''
              END ORDER BY JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) ASC) AS dias_semana,
              MIN(hora_inicio) AS hora_inicio,
              MAX(hora_fin) AS hora_fin
          FROM 
              config_cal
          WHERE 
              activo = 1
              AND id_cli = ?
          GROUP BY 
              id_externa
      ) cc ON m.id_medico = cc.id_externa
      WHERE 
      
              ${medico}
          mc.id_cli = ?
      ORDER BY e.descripcion;`;
    const doctors = await retornar_query(query, [id, id]);
    
    if(!isNaN(medic_id)){

      const query_horarios = `SELECT (CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 0 THEN 'Dom' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 1 THEN 'Lun' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 2 THEN 'Mar' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 3 THEN 'Mie' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 4 THEN 'Jue' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 5 THEN 'Vie' WHEN JSON_UNQUOTE(JSON_EXTRACT(dia_semana, '$[0]')) = 6 THEN 'Sab' ELSE '' END ) AS dias_semana, max_items, hora_inicio, hora_fin FROM config_cal WHERE 
              activo = 1
              AND id_cli = ?
              and id_externa=${medic_id}`;
      const horarios = await retornar_query(query_horarios, [id]);
      doctors.push({horarios:horarios})
    }
    
    doctors.push({logo: logo.replace("..","https://siac.empresas.historiaclinica.org")})
    res.json(doctors);

  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/doctors/citas', async (req, res) => {
  const { clinic_id,medic_id, fecha } = req.query; // Obtener la ID de la clínica desde los parámetros de consulta
  let id = '';
  let logo ='';
  let nombre_clinica = clinic_id.toLocaleUpperCase();
  let query_ag = "";
  if(isNaN(clinic_id)){
     query_ag = `SELECT pue.id_usuario_empresa,
                      pue.logo_empresa
                  FROM 
                      perfil_usuario_empresa  pue
                  WHERE 
                    pue.apellidos= ? `;
  }else{
    query_ag = `SELECT pue.id_usuario_empresa,
                      pue.logo_empresa
                  FROM 
                      perfil_usuario_empresa  pue
                  WHERE 
                    pue.id_usuario_empresa= ?  
                  LIMIT 1;`;
  }
  

  try {
    let ids = await retornar_query(query_ag, [nombre_clinica]);
    if(isNaN(clinic_id)){
      id = ids.map(item => item.id_usuario);
    }else{
      id = clinic_id 
    }    
    logo = ids[0].logo_empresa;
  } catch (error) {
registrarErrorPeticion(req, error)  
    res.status(500).json({ error: 'Clinica Invalida' });
    return
  }
  if (isNaN(medic_id)){
    return res.status(400).json({ error: 'Se requiere el parámetro medic_id' });
  }
  if (!clinic_id) {
    return res.status(400).json({ error: 'Se requiere el parámetro clinic_id' });
  }

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Se requiere el parámetro fecha' });
  }
   try {
    const query = `SELECT id_calendario, start, end 
                   FROM calendarios 
                   WHERE id_cli = ? 
                     AND id_medico = ? 
                     AND DATE(start) = ?;`;

    const filas = await retornar_query(query, [id, medic_id, fecha]);
    if(filas.error){
      return res.status(400).json({ success: true, error: 'No hay citas para la fecha' });
    }
    
    const citasCorregidas = filas.map(fila => {
      const start = new Date(fila.start);
      const end = new Date(fila.end);
      const idCalendario = fila.id_calendario;

      // Corrección: restar 1 hora (por error de zona horaria UTC−5 en lugar de UTC−4)
      start.setTime(start.getTime() - 60 * 60 * 1000);
      end.setTime(end.getTime() - 60 * 60 * 1000);

      return {
        start: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        end: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        idCalendario:idCalendario
      };
    });

    res.json(citasCorregidas);

  } catch (error) {    
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/localidades', async (req, res) => {
  const { tipo,tipo_id } = req.query; // Obtener la ID de la clínica desde los parámetros de consulta
  const result = await validateLocalidad(req.query);
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }
  let query =''
  switch (filtros.tipo) {
    case 'mun':
        query = `SELECT
                  id_municipio,
                  municipio
                FROM
                  municipios
                WHERE
                  id_estado=?`;      
      break;
    case 'par':
          query = `SELECT
            id_parroquia,
            parroquia
          FROM
            parroquias
          WHERE
            id_municipio=?`;
      break 
      case 'zon':
        query = `SELECT
          id_zona,
          zona, 
          activo
        FROM
          zonas
        WHERE
          id_parroquia=? OR id_parroquia=0`;
    break        
    default:
      query = `SELECT
              id_estado,
              estado
            FROM
              estados`;      
      break;
  }

try {
  
  let localidad = await retornar_query(query, [filtros.tipo_id]);
  res.json(localidad);
} catch (error) {
registrarErrorPeticion(req, error)  
  res.status(500).json({ error: 'No existe paciente' });
  return
}
});

app.use('/images', express.static(path.join(__dirname, '../images')));

app.use(express.static(path.join(__dirname, '..')));

app.use('/api/', routes);

app.post('/api/login', loginRateMax, async (req, res) => {
  try {
    const { usuario, password, ip_internet, ip_local } = req.body;
    if(!usuario || !password){
      throw new Error('Usuario y contraseña son requeridos');
    }
    const user = await authenticateLocal(usuario, password, ip_internet, ip_local);
    
    const requestId = Date.now() + Math.random();

    const requestQuery = Object.keys(req.query).length > 0 
      ? JSON.stringify(req.query) 
      : null;

    const { password: _, ...bodySinPassword } = req.body;
    const requestBodySafe = JSON.stringify(bodySinPassword);

    req.requestId = requestId;
    req.logData = {
      id_usuario: user.id_usuario,
      ip_origen: ip_internet,
      metodo: req.method,
      ruta: req.path,
      user_agent: req.headers['user-agent'],
      request_body: requestBodySafe, 
      requestQuery: requestQuery || '{}'
    };

    registrarInicioPeticion(req.logData); 

    const token = generateToken(user);
    res.json({ token });

  } catch (error) {
    registrarErrorPeticion(req, error)
    res.status(401).json({ error: error.message });
  }
});
//loginMasterLimiter
app.post('/api/login-master/:id',   authenticateToken,async (req, res) => {
  const {clinica} = req.body;
  const {id} = req.params;
  try {
    let queryVerifUser = `
      SELECT id_grupo_usuario FROM grupos_usuarios_det WHERE id_usuario = ?;
    `;
    let verifUser = await retornar_query(queryVerifUser, [id]);
    if(verifUser.error){
      return res.status(401).json({ error: 'Usuario no valido' });
    }
    if(verifUser[0].id_grupo_usuario != 1){
      return res.status(401).json({ error: 'Usuario no es master' });
    }
    let queryVerifEmpre = `
      SELECT id_usuario_empresa FROM perfil_usuario_empresa  WHERE id = ?;
    `;

    let verifEmpre = await retornar_query(queryVerifEmpre, [clinica]);
    if(verifEmpre.error){
      return res.status(406).json({ error: 'Empresa no valida' });
    }
    if(isNaN(verifEmpre[0].id_usuario_empresa)){
      return res.status(406).json({ error: 'Empresa no conseguida' });
    }
    let queryActualizarUsuario = `
      UPDATE perfil_usuario_basico SET id_usuario_empresa = ? WHERE id_usuario = ?;
    `;
    let actualizarUsuario = await retornar_query(queryActualizarUsuario, [verifEmpre[0].id_usuario_empresa, id]);
           
    return res.json({success:true,
                     ususariosActualizados:actualizarUsuario.affectedRows,
                     empresa:verifEmpre[0].id_usuario_empresa
                    });
  }catch(error){
    registrarErrorPeticion(req, error);
    return res.status(500).json({ error: error.message });
  }
})

app.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido. Use: Bearer <token>' });
  }

  const token = parts[1];

  // Agregar el token a la lista negra
  tokenBlacklist.add(token);

  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/login/', (req, res) => {
  res.sendFile(path.join(__dirname, 'https://siac.empresas.historiaclinica.org/index.html'));
});

app.use('/decodifica', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader.split(' ')[1]?.trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json(decoded);
  } catch (error) {
    
    if (error.name === 'TokenExpiredError') {
      registrarErrorPeticion(req, error.name)
      return res.status(401).json({ error: 'El token ha expirado', redirectTo: '/login' });      
    } else {
      
      return res.status(401).json({ error: 'Token malformado o inválido', redirectTo: '/login' });
    }
  }
});
app.get('/validate-token', authenticateToken, (req, res) => {
  res.json({ message: 'Token válido', user: req.user });
});
app.post('/cargar_query', async (req, res) => {
  res.header('Access-Control-Allow-Origin','*')
  const { id_query, filtros, id_contenedor=0 } = req.body;
  
  if (id_contenedor < 0 || id_contenedor >= contenedor_query.length) {
    return res.status(400).json({ error: 'Contenedor invalido' });
  }

  let queries = contenedor_query[id_contenedor];
  
  if (id_query < 0 || id_query >= contenedor_query[id_contenedor].length) {
    return res.status(400).json({ error: 'Invalid id_query ' });
  }

  try {

    const result = await retornar_query(queries[id_query], filtros); 

    res.json(result);
  } catch (error) {
registrarErrorPeticion(req, error)
    
    res.status(500).json({ error: 'Internal server error' +error });
  }
});

app.get('/api/pacientes', async (req, res) => {

  const {id_paciente} = req.query

  // Validar que id_paciente exista y sea un número
  if (!id_paciente || isNaN(id_paciente)) {
    const result = await validatePatientCed(req.query);

    if (result.error ){
      return res.status(422).json({error: JSON.parse(result.error.message)})
    }
    const filtros = { ...result.data }
    
    let query_pac = `SELECT id_paciente,
                        apellidos, 
                        nombres,
                        telef1,
                        sexo,
                        correo,
                        fecha_nacimiento,
                        direccion
                    FROM pacientes 
                    WHERE cedula = ? and tipo_cedula = ?`;
    try {
      let paciente = await retornar_query(query_pac, [filtros.cedula, filtros.tipo_cedula]);
      id = paciente.map(item => item.id_paciente);
      return res.json(paciente);
    } catch (error) {
      
      res.status(500).json({ error: 'No existe paciente' });
      return
    } 
  }
  const filtros = { id_paciente }
    
    let query_pac = `SELECT 
                        tipo_cedula,
                        cedula,
                        apellidos, 
                        nombres,
                        telef1,
                        sexo,
                        correo,
                        fecha_nacimiento,
                        direccion
                    FROM pacientes 
                    WHERE id_paciente = ?`;
    try {
      let paciente = await retornar_query(query_pac, [id_paciente]);      
      return res.json(paciente);
    } catch (error) {
registrarErrorPeticion(req, error)  
      res.status(500).json({ error: 'No existe paciente' });
      return
    } 

  
  
});

app.get('/api/tipo_admision', async (req, res) => {
  const { tipo,clinic_id } = req.query;
  if (!clinic_id) {
    return res.status(400).json({ error: 'Se requiere el parámetro clinic_id' });
  }
  var ident = ''
  var tipo_str = ''
  switch (tipo) {
    case 'S':
      ident = 'id_seguro';
      tipo_str = 'seguros'
      break;
    case 'E':
      ident = 'id_empresa';
      tipo_str = 'empresas'
      break;
    case 'I':
      ident = 'id_tipo_interno';
      tipo_str = 'tipos_interno'
      break;
    case 'sub':
      ident = 'id_subempresa';
      tipo_str = 'subempresas'
      break;  
    default:
      res.status(400).json({ error: 'tipo incorrecto' });
      break;
  }
  
  let subquery = (isNaN(clinic_id)) ?  `(SELECT id_usuario_empresa FROM perfil_usuario_basico WHERE apellidos = '${clinic_id}')` : clinic_id

  let query = `SELECT ${ident},
                      descripcion, 
                      activo
                  FROM ${tipo_str} 
                  WHERE activo=1 and id_cli = ${subquery}
                  ORDER BY descripcion`;
                  
  try {
    let listado = await retornar_query(query, [clinic_id]);
    
    res.json(listado);
  } catch (error) {
registrarErrorPeticion(req, error)  
    res.status(500).json({ error: 'No existe paciente' });
    return
  } 
});

app.post('/api/crear-admision', authenticateToken, async (req, res) => {
  
  const result = await registrarAdmision(req.body);
  
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const filtros = { ...result.data }
  
  let query = `INSERT INTO admisiones
                    (id_paciente,
                    id_seguro,
                    id_empresa,
                    id_tipo_interno,
                    tipo_consulta,
                    id_estado,
                    id_municipio,
                    id_parroquia,
                    id_zona,
                    edad,
                    fecha_admision,
                    fecha_factura,
                    fecha_cierre,
                    tasa,
                    id_usuario_cierre,
                    id_usuario,
                    id_cli,
                    id_representante,
                    factura,
                    motivo_cierre,
                    id_subempresa,
                    id_status_cierre, 
                    control, id_preadmision, id_canal_atraccion)                     
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
try {
  let admision = await retornar_query(query, 
    [
      filtros.id_paciente,
      filtros.id_seguro,
      filtros.id_empresa,
      filtros.id_tipo_interno,
      filtros.tipo_consulta,
      filtros.id_estado,
      filtros.id_municipio,
      filtros.id_parroquia,
      filtros.id_zona,
      filtros.edad,
      filtros.fecha_admision,
      filtros.fechafactura,
      filtros.fecha_cierre,
      filtros.tasa,
      filtros.id_usuario_cierre,
      filtros.id_usuario,
      filtros.id_cli,
      filtros.id_representante,
      filtros.factura,
      filtros.motivo_cierre,
      filtros.id_subempresa,
      filtros.id_status_cierre,
      filtros.control,
      filtros.id_preadmision,
      filtros.id_canal_atraccion||0,
    ]);
  res.json({ id_admision: admision.insertId }); 
  
} catch (error) {
registrarErrorPeticion(req, error)  
  res.status(500).json({ error: error });
  return
}
});

app.post('/api/crear-admision-detalle',  authenticateToken, async (req, res) => {  
  const result = await registrarDetalleAdmision(req.body);
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const filtros = { ...result.data }  
  let query = `INSERT INTO admisiones_det
                    (id_admision,
                    id_consultorio,
                    id_medico,
                    id_estudio,
                    precio,
                    precio_usd,
                    cantidad,
                    id_moneda,
                    id_tecnico,
                    id_medico2,
                    nota,
                    cambio,
                    id_usuario)                     
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
try {
  let admision_det = await retornar_query(query, 
    [
        filtros.id_admision,
        filtros.id_consultorio,
        filtros.id_medico,
        filtros.id_estudio,
        filtros.precio,
        filtros.precio_usd,
        filtros.cantidad,
        filtros.id_moneda,
        filtros.id_tecnico,
        filtros.id_medico2,
        filtros.nota,
        filtros.cambio,
        filtros.id_usuario
    ]);
  res.json({ id_admidet: admision_det.insertId });
  
} catch (error) {
registrarErrorPeticion(req, error)  
  
  res.status(500).json({ error: error });
  return
}
});

app.get('/api/validar-cita', async (req, res) => {  
  const { id,id2 } = req.query; // Obtener la ID de la clínica desde los parámetros de consulta

  if(isNaN(id)||isNaN(id2)){
    res.json({ error: 'Datos de cita incorrectos' });
    return
  }

  let query_ag = `UPDATE calendarios SET status_ag='Esperando' WHERE id_calendario=? AND id_paciente=? AND status_ag='Pendiente';`;
  
  try {
    let ids = await retornar_query(query_ag, [id,id2]);    
    if(ids.affectedRows==1){
      res.json({ status: 'ok' });
    }else{
      query_ag = "SELECT status_ag, start FROM calendarios WHERE id_calendario=? and activo =1"
      ids = await retornar_query(query_ag, [id]);

      if(ids.error){
        res.json( { error:"Esta cita ya no existe o no fue validada a tiempo (mismo dia)" } );  
        return
      }

      res.json( { status:ids[0].status_ag, fecha:ids[0].start} );
         
    } 
    
  } catch (error) {
registrarErrorPeticion(req, error)  
    res.status(500).json({ error: error });
    return
  }
});

app.post('/api/config-honorarios', authenticateToken, async (req, res) => {
  
  const result = await validateHonorariosConfig(req.body);

  if (result.error ){    
    registrarErrorPeticion(req, error); 
    return res.status(422).json({error: JSON.parse(result.error.message)})

  }

  const filtros = { ...result.data }
  
  let query = `INSERT INTO grupo_estudio_honorarios
                    (descripcion,
                    activo,
                    porcentaje_med,
                    monto_fijo,
                    id_moneda,
                    descuento_porcent,
                    porcentaje_tec,
                    monto_fijo_tec,
                    id_moneda_tec,
                    id_cli)                     
                  VALUES (?,?,?,?,?,?,?,?,?,?)`;
try {
  let config_honorarios = await retornar_query(query, 
    [
        filtros.descripcion,
        filtros.activo,
        filtros.porcentaje_med,        
        filtros.monto_fijo,
        filtros.id_moneda,
        filtros.descuento_porcent,
        filtros.porcentaje_tec,
        filtros.monto_fijo_tec,
        filtros.id_moneda_tec,
        filtros.id_cli       
    ]);
    
  res.json({ id_insertada: config_honorarios.insertId });
  
} catch (error) {  
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: error });
  return
}
});

app.get('/api/bcv',  async (req, res) => {
  try {
    obtenerTasasBCV()
  .then(data => {
    if (!data.error) {
      
      res.json({ data });
    }
  });
 
  } catch (error) {   
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error });
    return;
  }  
});


app.get('/api/banesco',  async (req, res) => {
  
  try {
    obtenerTasaBanesco()
  .then(data => {
    if (!data.error) {
      
      res.json({ data });
    }
  });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error });
    return;
  }  
});

app.patch('/api/config-honorarios', authenticateToken, async (req, res) => {
  
  const result = await actualizarHonorariosConfig(req.body);

  if (result.error ){   
    registrarErrorPeticion(req, error); 
    return res.status(422).json({error: JSON.parse(result.error.message)})

  }
  
  const filtros = { ...result.data }  

  try {
    let updates = Object.keys(filtros)
      .filter(campo => campo !== 'id_honorario')
      .map(campo => `${campo} = ?`)
      .join(', ');
    let values = Object.keys(filtros)
      .filter(campo => campo !== 'id_honorario')
      .map(campo => filtros[campo]);

    let query = `UPDATE grupo_estudio_honorarios 
        SET ${updates} WHERE id_grupo_estudio = ?`;

    values.push(filtros.id_honorario);
    let config_honorarios = await retornar_query(query, values);
    
    res.json({ affectedRows: config_honorarios.affectedRows });

  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error });
    return;
  }  
});

async function eliminar_pendientes() {
    let query = `DELETE FROM
                  calendarios          
                WHERE status_ag='Pendiente'`;
    try {
    let eliminar_pendientes = await retornar_query(query,[]);

    } catch (error) {        
      registrarErrorPeticion(req, error);
    return
    }
}

cron.schedule('0 0 * * *', () => {
  eliminar_pendientes();
}, {
    timezone: "America/Caracas" // Zona horaria de Venezuela
});

function validarTiposConsulta(tipos) {
  if (!Array.isArray(tipos)) {
    throw new Error('tipos_consulta debe ser un array');
  }
  
  const invalidChars = tipos.filter(t => 
    typeof t !== 'string' || t.length !== 1 || !/^[A-Z]$/.test(t)
  );
  
  if (invalidChars.length > 0) {
    throw new Error(`Tipos de consulta inválidos: ${invalidChars.join(', ')}. Solo se permiten letras individuales.`);
  }
  
  return true;
}

function validarActivos(activos) {
  if (!Array.isArray(activos)) {
    throw new Error('activos debe ser un array');
  }
  
  const invalidValues = activos.filter(a => 
    ![0, 1].includes(Number(a))
  );
  
  if (invalidValues.length > 0) {
    throw new Error(`Valores activos inválidos: ${invalidValues.join(', ')}. Solo se permiten 0 y 1.`);
  }
  
  return true;
}

async function getAdmisiones(params) {
  const { id_cli, fecha_inicio, fecha_fin, tipos_consulta, activos, page = 1, perPage = 50 } = params;

  const offset = (page - 1) * perPage;

  const tipoPlaceholders = tipos_consulta.map(() => '?').join(',');
  const activoPlaceholders = activos.map(() => '?').join(',');

  const sql =`SELECT admisiones.*,
	admisiones_det.id_admision,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_completo_paciente,
    pacientes.telef1,
    pacientes.direccion,
    pacientes.fecha_nacimiento,
    seguros.descripcion AS seguro,
    empresas.descripcion AS empresa,
    tipos_interno.descripcion AS interno,
    estudios.descripcion as estudio,
    concat(medicos.nombre, ' ',medicos.apellido) as medico,
    zonas.zona,
    CONCAT(titular.tipo_cedula, '-', titular.cedula) AS cedula_titular,
    CONCAT(titular.nombres, ' ', titular.apellidos) AS nombre_completo_titular,
    CONCAT(perfil_usuario_basico.nombre, ' ', perfil_usuario_basico.apellidos) AS usuario
FROM 
    admisiones
INNER JOIN 
    admisiones_det ON admisiones_det.id_admision = admisiones.id_admision
INNER JOIN 
    pacientes ON admisiones.id_paciente = pacientes.id_paciente
INNER JOIN 
    perfil_usuario_basico ON admisiones.id_usuario = perfil_usuario_basico.id_usuario
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio
INNER JOIN 
    medicos  ON admisiones_det.id_medico = medicos.id_medico
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno
LEFT JOIN 
    pacientes AS titular ON admisiones.id_representante = titular.id_paciente
LEFT JOIN 
    zonas ON admisiones.id_zona = zonas.id_zona
WHERE 
    admisiones.id_cli = ? AND
    ${tipos_consulta.length ? `AND admisiones.tipo_consulta IN (${tipoPlaceholders})` : ''}
    ${activos.length ? `AND admisiones.activo IN (${activoPlaceholders})` : ''}
    admisiones.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
ORDER BY admisiones.fecha_admision DESC 
    LIMIT ? OFFSET ?`;

    const queryParams = [
      id_cli,
      fecha_inicio,
      fecha_fin,
      ...tipos_consulta,
      ...activos,
      perPage,
      offset
    ].filter(p => p !== undefined);

  const [rows] = await retornar_query(sql, queryParams);
  return rows;
}

  app.post('/admisiones_admidet', async (req, res) => {
    try {
      const { id_cli, fecha_inicio, fecha_fin, tipos_consulta = [], status_cierre=null , activos = [], page = 1, perPage = 50, agrupado='s' } = req.body;
      const offset = (page - 1) * perPage;
      
      const tipoPlaceholders = tipos_consulta.map(() => '?').join(',');
      const activoPlaceholders = activos.map(() => '?').join(',');
      let status_cierre_simbol = null
      if(status_cierre){
        if(status_cierre=='cerrado'){
          status_cierre_simbol='AND admisiones.id_status_cierre > 1 '
        }else{
          status_cierre_simbol='AND admisiones.id_status_cierre = 1 '
        }
      }
          
      let sql_agrupado =`SELECT 
      admisiones.*,
      SUM(admisiones_det.precio * admisiones_det.cantidad) AS precio,
      SUM(admisiones_det.precio_usd * admisiones_det.cantidad) AS precio_usd,
      SUM(admisiones_det.cantidad) AS cantidad,
      CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
      CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_completo_paciente,
      pacientes.telef1,
      pacientes.direccion,
      pacientes.fecha_nacimiento,
      seguros.descripcion AS seguro,
      empresas.descripcion AS empresa,
      tipos_interno.descripcion AS interno,
      'Estudios agrupados' AS estudio, -- Estudio siempre será "Estudios agrupados"
      CONCAT(medicos.nombre, ' ', medicos.apellido) AS medico,
      zonas.zona,
      CONCAT(titular.tipo_cedula, '-', titular.cedula) AS cedula_titular,
      CONCAT(titular.nombres, ' ', titular.apellidos) AS nombre_completo_titular,
      usuarios.usuario AS usuario,
      admisiones_cierres_tipo.descripcion AS tipo_cierre
  FROM 
      admisiones
  INNER JOIN 
      admisiones_det ON admisiones_det.id_admision = admisiones.id_admision
  INNER JOIN 
      pacientes ON admisiones.id_paciente = pacientes.id_paciente
  INNER JOIN 
      admisiones_cierres_tipo ON admisiones.id_status_cierre = admisiones_cierres_tipo.id
  INNER JOIN 
    usuarios ON admisiones.id_usuario = usuarios.id 
  LEFT JOIN 
      medicos ON admisiones_det.id_medico = medicos.id_medico
  LEFT JOIN 
      seguros ON admisiones.id_seguro = seguros.id_seguro
  LEFT JOIN 
      empresas ON admisiones.id_empresa = empresas.id_empresa
  LEFT JOIN 
      tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno
  LEFT JOIN 
      pacientes AS titular ON admisiones.id_representante = titular.id_paciente
  LEFT JOIN 
      zonas ON admisiones.id_zona = zonas.id_zona  `
        // Construir consulta
        let sql =`SELECT admisiones.*,
            admisiones_det.id_admidet,
            admisiones_det.precio,
            admisiones_det.precio_usd,
            admisiones_det.cantidad,
            CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
            CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_completo_paciente,
            pacientes.telef1,
            pacientes.direccion,
            pacientes.fecha_nacimiento,
            seguros.descripcion AS seguro,
            empresas.descripcion AS empresa,
            tipos_interno.descripcion AS interno,
            estudios.descripcion as estudio,
            concat(medicos.nombre, ' ',medicos.apellido) as medico,
            zonas.zona,
            CONCAT(titular.tipo_cedula, '-', titular.cedula) AS cedula_titular,
            CONCAT(titular.nombres, ' ', titular.apellidos) AS nombre_completo_titular,
            usuarios.usuario AS usuario,
            admisiones_cierres_tipo.descripcion AS tipo_cierre,
            te.descripcion as tipo_estudio,
            gre.descripcion as grupo_estudio
        FROM 
            admisiones
        INNER JOIN 
            admisiones_det ON admisiones_det.id_admision = admisiones.id_admision
        INNER JOIN 
            pacientes ON admisiones.id_paciente = pacientes.id_paciente
        INNER JOIN 
          admisiones_cierres_tipo ON admisiones.id_status_cierre = admisiones_cierres_tipo.id
        INNER JOIN 
            usuarios ON admisiones.id_usuario = usuarios.id
        INNER JOIN 
            estudios ON admisiones_det.id_estudio = estudios.id_estudio
        INNER JOIN 
            medicos  ON admisiones_det.id_medico = medicos.id_medico
        INNER JOIN 
          tipo_estudio te ON estudios.id_tipo_estudio = te.id_tipo_estudio
        INNER JOIN 
          grupo_estudio gre ON estudios.id_grupo_estudio = gre.id_grupo_estudio
        LEFT JOIN 
            seguros ON admisiones.id_seguro = seguros.id_seguro
        LEFT JOIN 
            empresas ON admisiones.id_empresa = empresas.id_empresa
        LEFT JOIN 
            tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno
        LEFT JOIN 
            pacientes AS titular ON admisiones.id_representante = titular.id_paciente
        LEFT JOIN 
            zonas ON admisiones.id_zona = zonas.id_zona  `
        
    let wheres =   ` WHERE 
            admisiones.id_cli = ? 
            AND admisiones_det.activo=1 
            ${status_cierre_simbol}
            ${tipos_consulta.length ? `AND admisiones.tipo_consulta IN (${tipoPlaceholders})` : ''}
            ${activos.length ? `AND admisiones.activo IN (${activoPlaceholders})` : ''}
            AND admisiones.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
            `;

        const params = [
        id_cli,
        ...tipos_consulta,
        ...activos,
        fecha_inicio,
        fecha_fin,
        perPage,
        offset
      ].filter(p => p !== undefined);
        
        // Ejecutar consulta de forma más segura
        if(agrupado=='n'){
          sql=sql+wheres+ " ORDER BY admisiones.id_admision DESC LIMIT ? OFFSET ?"
        }else{
          sql=sql_agrupado+ wheres + " GROUP BY     admisiones.id_admision  ORDER BY admisiones.id_admision DESC  LIMIT ? OFFSET ?"
        }
        
        const result = await retornar_query(sql, params);
        if(status_cierre){
          if(status_cierre=='cerrado'){
            status_cierre_simbol='AND adm.id_status_cierre != 1 '
          }else{
            status_cierre_simbol='AND adm.id_status_cierre = 1 '
          }
        }
        
        // Consulta de conteo
        const countResult = await retornar_query(
          `SELECT COUNT(adm.id_admision) as total,
                  COUNT(DISTINCT adm.id_admision) as total_admisiones,
                  count(admisiones_det.id_admision) as admidet,
                  COUNT(DISTINCT adm.id_paciente) AS total_pacientes,
                  sum(admisiones_det.precio*admisiones_det.cantidad) AS precio,
                  sum(admisiones_det.precio_usd*admisiones_det.cantidad) AS precio_usd
          FROM admisiones adm, admisiones_det
              WHERE admisiones_det.id_admision=adm.id_admision
              AND adm.id_cli = ?
              AND admisiones_det.activo=1 
              ${status_cierre_simbol}
              AND adm.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')
              ${tipos_consulta.length ? `AND adm.tipo_consulta IN (${tipoPlaceholders})` : ''}
              ${activos.length ? `AND adm.activo IN (${activoPlaceholders})` : ''} `,
          [id_cli, fecha_inicio, fecha_fin, ...tipos_consulta, ...activos]
        );
        
        const pacientes = countResult[0]?.total_pacientes || 0;
        const precio = countResult[0]?.precio || 0;
        const precio_usd = countResult[0]?.precio_usd || 0;
        const total = countResult[0]?.total || 0;
        const total_admisiones = countResult[0]?.total_admisiones || 0;
        const totalPages=(agrupado=='n') ? Math.ceil(total / perPage):  Math.ceil(total_admisiones / perPage)
        res.json({ 
          success: true,
          resultados: result,
          pagination: {
            page,
            perPage,
            total,
            totalPages,
            pacientes,
            precio,
            precio_usd,total_admisiones
          }
        });
      
    } catch (error) {
registrarErrorPeticion(req, error)
      
      res.status(500).json({
        success: false,
        message: 'Error al procesar la solicitud',
        error: error.message
      });
    }
  });

function validarParametrosAdmisiones(req, res, next) {
  try {
    if (req.body.tipos_consulta) {
      validarTiposConsulta(req.body.tipos_consulta);
    }
    if (req.body.activos) {
      validarActivos(req.body.activos);
    }
    next();
  } catch (error) {
registrarErrorPeticion(req, error)
    res.status(400).json({ error: error.message });
  }
}

app.post('/cerrar_admision', async (req, res) => {
  try {
    const { id_admision,
      motivo,
      id_usuario,
      nota, 
      factura } = req.body;
      
      if(!id_admision || !motivo || !id_usuario ){
        return res.status(400).json({ error: '356' }); //No se enviaron los campos necesarios
      }
      if(isNaN(id_admision) || isNaN(motivo) || isNaN(id_usuario)){
        return res.status(400).json({ error: '357' }); //Campos invalidos
      }

    let sql =`UPDATE 
                admisiones 
              SET 
                id_status_cierre=?, 
                motivo_cierre='Cierre Manual', 
                fecha_cierre=NOW(), 
                nota=CONCAT(nota, ' | ', ?),
                id_usuario_cierre=?,
                factura=? 
              WHERE 
                id_admision=?`;

      const params = [motivo,
        nota,
        id_usuario,
        factura,
        id_admision
      ];
      let sql_admision =`SELECT 
                id_status_cierre 
              FROM
                admisiones              
              WHERE 
                id_admision=?`;
      const params_sql = [id_admision];
      const result_status = await retornar_query(sql_admision, params_sql);
      
      if(result_status[0].id_status_cierre!=1){
        return res.status(400).json({ error: '358' }); //Admision ya cerrada
      }

      const result = await retornar_query(sql,params);      
      
      res.json({success: true,
        resultados: result});
     
  } catch (error) {
registrarErrorPeticion(req, error)
    
    res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud',
      error: error.message
    });
  }
});

app.get('/api/cmic/recibo_honorarios', async (req, res) => {
  const { recibo } = req.query; 
  
  if(recibo=='' || recibo===null){
    res.status(500).json({ error: 'CM02' }); //recibo no enviado
    return
  }
  if(isNaN(recibo) ){
    res.status(500).json({ error: 'CM01' }); //recibo invalido
    return
  }
  let query_honorario = contenedor_query[4][1] + "  and cp.activo !=0"
 
  const result = await retornar_query( query_honorario, recibo);

  if(result.error){
      let query_honorario = contenedor_query[4][1]  
      const result = await retornar_query( query_honorario, recibo);
      if(result.error){
        res.status(500).json({ error: 'CM04' }); //recibo no existe
      }
      res.status(500).json({ error: 'CM03' }); //admision no cobrada
    return
  }  

  const query_ppl = `SELECT 
                     id_med,                      
                     medico,
                     nota,
                     tasa,
                     fecha_creacion, 
                     activo                     
                    FROM 
                      hon_med_recibo
                    WHERE 
                      hon_med_recibo.id_hon_med_pago=?`;
                    
  const result_ppl = await retornar_query(query_ppl, recibo);

  const query_tipo3 = `SELECT 
                          estudio,
                          monto,
                          tipo, 
                          CASE 
                            WHEN monedas IN ('Bs', 'Bolivares') THEN 2 
                            WHEN monedas IN ('$', 'USD', 'Dolares') THEN 1 
                            ELSE monedas END AS monedas 
                          FROM hon_med_recibo_det1 
                          WHERE id_hon_med_pago=? and tipo=3 ORDER BY id_hon_med_det1 DESC`;
  const result_tipo3 = await retornar_query(query_tipo3, recibo);

  const query_tipo2 = `SELECT 
                          cant,  
                          estudio, 
                          valor_completo, 
                          monto, 
                          CASE 
                              WHEN monedas IN ('Bs', 'Bolivares') THEN 2
                              WHEN monedas IN ('$', 'USD', 'Dolares') THEN 1
                              ELSE monedas
                          END AS monedas   
                        FROM 
                          hon_med_recibo_det1 
                        WHERE 
                          tipo = '2' AND
                          id_hon_med_pago =?`;
  const result_tipo2 = await retornar_query(query_tipo2, recibo);

  result.push({result_tipo3})
  res.json({success: true,
    resultados: result,
    result_tipo2: result_tipo2,
    recibo: result_ppl});
});

app.post('/api/listado_entrega',  async (req, res) => {
  const result = req.body;

  if (result.error ){    
    registrarErrorPeticion(req, error); 
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const { fecha_inicio, fecha_fin, tipos_admision, id_cli } = result;

  if (!fecha_inicio || !fecha_fin || !tipos_admision || !id_cli) {
    return res.status(400).json({ error: 'Los campos fecha_inicio, fecha_fin, tipos_admision e cliente son requeridos.' });
  }

  const fechaInicioRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!fechaInicioRegex.test(fecha_inicio) || !fechaInicioRegex.test(fecha_fin)) {
    return res.status(400).json({ error: 'Las fechas deben estar en el formato yyyy-mm-dd.' });
  }

  const fechaInicioDate = new Date(fecha_inicio);
  const fechaFinDate = new Date(fecha_fin);

  if (isNaN(fechaInicioDate.getTime()) || isNaN(fechaFinDate.getTime())) {
    return res.status(400).json({ error: 'Las fechas proporcionadas no son válidas.' });
  }

  if (fechaInicioDate > fechaFinDate) {
    return res.status(400).json({ error: 'La fecha de inicio no puede ser posterior a la fecha de fin.' });
  }
  let query_l = "";
  grupos = result.grupos || [];
  tipos = result.tipos || [];  
try {
  if (tipos.length >0) {
    tipos = ` e.id_tipo_estudio IN (${tipos}) AND `
  }else{
    tipos = ""
  }
  if (grupos.length >0) {
    grupos = ` e.id_grupo_estudio IN (${grupos}) AND `
  }else{
    grupos = ""
  }
  
  query_l = `SELECT
                a.fecha_admision,
                a.tipo_consulta,
                a.id_admision,
                a.diagnostico,
                ad.fecha_detalle,
                ad.id_admidet,
                ad.precio,
                ad.precio_usd,
                ad.cantidad,
                CONCAT(p.nombres, ' ',p.apellidos) as paciente,
                p.fecha_nacimiento,
                CONCAT(p.tipo_cedula, '-', p.cedula) as cedula,
                e.descripcion as estudio,
                e.id_tipo_estudio,
                e.id_grupo_estudio,
                e.id_estudio,
                m.descripcion as muestras,
                em.id_muestra as id_muestras,
                met.descripcion as metodo,
                met.id as id_metodo
              FROM
                admisiones a
              INNER JOIN 
                admisiones_det ad ON ad.id_admision = a.id_admision
              INNER JOIN 
                pacientes p ON a.id_paciente = p.id_paciente
              INNER JOIN 
                estudios e ON ad.id_estudio = e.id_estudio
              LEFT JOIN
                estudios_muestras em ON e.id_estudio = em.id_estudio
              LEFT JOIN
                muestras m ON em.id_muestra  = m.id 
              LEFT JOIN
                estudios_metodos_procesamiento emp ON e.id_estudio = emp.id_estudio
              LEFT JOIN
                metodos met ON emp.id_metodo = met.id 
              WHERE
                a.id_cli = ? AND
                a.tipo_consulta IN (?) AND
                a.activo=1 AND
                ${tipos} 
                ${grupos}
                a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
              ORDER BY ad.fecha_detalle DESC`;
} catch (error) {
registrarErrorPeticion(req, error)
  res.status(500).json({ error: error,
  });  
}

try {
  let json_reporte = await retornar_query(query_l, 
    [
      result.id_cli,
      result.tipos_admision,
      result.fecha_inicio,        
      result.fecha_fin
    ]); 
    let json_muestras = await retornar_query(
      `SELECT 
        muestras.id, 
        muestras.descripcion 
      FROM 
        muestras
      WHERE 
        activo=1 and id_cli=? 
      ORDER BY
        muestras.descripcion ASC `, 
      [
        result.id_cli
      ]); 
      let json_metodos = await retornar_query(
      `SELECT 
        mp.id, 
        mp.descripcion 
      FROM 
        metodos mp
      WHERE 
        activo=1 and id_cli=? 
      ORDER BY
        mp.descripcion ASC `, 
      [
        result.id_cli
      ]); 
  res.json({ 
    success: true,
    resultados:json_reporte,
    muestras: json_muestras,
    metodos: json_metodos
  });
  
} catch (error) {
registrarErrorPeticion(req, error)  
  res.status(500).json({ error: error,
  } );   
  return
}
});

app.patch('/api/actualizar-admision',  async (req, res) => {
  
  const result = await actualizarAdmision(req.query); 
  
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }
  var valor_actualizable =''
  switch (filtros.campo) {
    case 'diagnostico':
      valor_actualizable = filtros.diagnostico;
      break;    
    default:
      break;
  }


  let query_adm = `UPDATE admisiones SET ${filtros.campo}='${valor_actualizable}'
                  WHERE id_admision=?`;
try {
  
  let admision = await retornar_query(query_adm, [filtros.id_admision]);
  
  res.json({ cantidad_rows: admision.affectedRows });
  
} catch (error) {  
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: 'No existe admision' });
  return
}
});

app.patch('/api/estudios-muestras',  async (req, res) => {
  
  const result = req.query;
  
  if (isNaN(result.id_estudio) || isNaN(result.id_muestra)) {
    return res.status(400).json({ error: 'AEM01',result }); //id_estudio o id_muestra no es un número
  }
 
  let query_estudios_muestras = `SELECT id_muestra FROM estudios_muestras
                  WHERE id_estudio=?`;
try {
 
  let id_muestra = await retornar_query(query_estudios_muestras, [result.id_estudio]);
  
  if(id_muestra.error){
    query_estudios_muestras = 
      `INSERT INTO 
        estudios_muestras (id_muestra, id_estudio, activo) 
      VALUES (?,?, 1)`;
    id_muestra = await retornar_query(query_estudios_muestras, [result.id_muestra, result.id_estudio]);
    if(id_muestra.error){
      res.status(500).json({ error: 'AEM02' }); //Error al insertar la muestra
      return
    }   
    res.json({ 
      metodo: 'insertar',
      Muestra: id_muestra.insertId }); 
  }else{
    query_estudios_muestras = 
      `UPDATE estudios_muestras SET id_muestra=?, activo=1 
      WHERE id_estudio=?`;
    id_muestra = await retornar_query(query_estudios_muestras, [result.id_muestra, result.id_estudio ]);
    if(id_muestra.error){
      res.status(500).json({ error: 'AEM03' }); //Error al actualizar la muestra
      return
    }    
    res.json({ 
      metodo: 'actualizar',
      Muestra: id_muestra.affectedRows }); 
  }

  
} catch (error) {  
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: error });
  return
}
});

app.patch('/api/tasas-admision',  async (req, res) => {
  
  const result = req.body;
  
 if (!Array.isArray(result.admisiones)) {
    return res.status(400).json({ error: 'ATA01', parametros: result.admisiones});//, message: 'admisiones debe ser un array' 
  }
  if (result.admisiones.length === 0) {
    return res.status(400).json({ error: 'ATA02'});//, message: 'admisiones no puede estar vacío' 
  }
  if (isNaN(result.tasa)) {
    return res.status(400).json({ error: 'ATA03'});//, message: 'tasa debe ser un número' 
  }

  let query_validar = 
    `SELECT 
      COUNT(id_admision) as cantidad
    FROM 
      admisiones
    WHERE 
      id_admision IN (?) AND 
      id_status_cierre!=1`;

try {
 
  let cantidad_cerrada = await retornar_query(query_validar, [result.admisiones]);
  
  if(cantidad_cerrada[0].cantidad > 0){
      res.status(500).json({ 
        estado: 'error',
        error: `Existen ${cantidad_cerrada[0].cantidad} admisiones cerradas`,
        }); 
      return   
  }else{
    let query_admisiones_tasa = 
      `UPDATE admisiones SET tasa=? 
      WHERE id_admision IN (?)`;
    let admisiones_cambiadas = await retornar_query(query_admisiones_tasa, [result.tasa, result.admisiones ]);
    if(admisiones_cambiadas.error){
      res.status(500).json({ error: 'ATA05' }); //Error al actualizar la admision
      return
    } 

    let query_admisiones_det_tasa = 
      `UPDATE admisiones_det SET cambio=?, precio=(precio_usd * ?) 
      WHERE id_admision IN (?)`;
    let admisiones_det_cambiadas = await retornar_query(query_admisiones_det_tasa, [result.tasa, result.tasa, result.admisiones ]);
    
    if(admisiones_det_cambiadas.error){
      res.status(500).json({ error: 'ATA06' }); //Error al actualizar la admision_det
      return
    }    

    res.json({ 
      estado: 'ok',
      admisiones: admisiones_cambiadas.affectedRows,
      detalles: admisiones_det_cambiadas.affectedRows,
      cantidad: cantidad_cerrada[0].cantidad, }
      ); 
  }

  
} catch (error) {  
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: error });
  return
}
});

app.post('/api/add_zonas',  async (req, res) => {
  const result = req.body;

  if (result.error ){
    registrarErrorPeticion(req, error);    
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const { id_zona, id_parroquia, descripcion, activo } = result;



  let query = "";
  let json_result ="";
try {
  if (!id_zona) {
    if (!id_parroquia || !descripcion ) {
      return res.status(400).json({ error: 'az01' });
    }
    query = `INSERT INTO  
              zonas 
            (id_parroquia,zona,activo)
              VALUES
            (?,?,1)`;
    json_result = await retornar_query(query, 
            [ result.id_parroquia,
              result.descripcion ]); 
  }else{
    if (!isNaN(activo)) {
      if (!id_zona ) {
        return res.status(400).json({ error: 'az02' });
      }
      query = `UPDATE
                zonas
              SET activo=?
                WHERE
              id_zona=?`;
      json_result = await retornar_query(query, 
                [ result.activo,
                  result.id_zona ]); 
    }else{
      query = `UPDATE
                zonas
              SET id_parroquia=?,zona=? 
                WHERE
              id_zona=?`;
      json_result = await retornar_query(query, 
              [ result.id_parroquia,
                result.descripcion,
                result.id_zona]); 
    }
  }
   
} catch (error) {
registrarErrorPeticion(req, error)
  res.status(500).json({ error: error,
  });  
}

res.json({ 
  success: true,
  resultados:json_result
});

});

app.post('/api/movimiento_inventario',  async (req, res) => {
  const result = req.body;

  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const { almacen_salida, 
    almacen_destino, 
    id_insumo, 
    id_entrega, 
    id_responsable,
    cantidad,
    descripcion,
    descripcion_salida,
    id_admidet } = result;



  // Validate numeric fields
  const numericFields = { almacen_salida, almacen_destino, id_insumo, id_entrega, id_responsable, cantidad, id_admidet };
  for (const [key, value] of Object.entries(numericFields)) {
    if (isNaN(value)) {
      return res.status(400).json({ error: `MI${key}-01` });
    }
  }

  let query_salida = `Select id_almacen from almacenes_consultorio where id_consultorio =?`; 
  let almacen_salida_final =await retornar_query(query_salida,[almacen_salida]);
  try {
    almacen_salida_final = almacen_salida_final[0].id_almacen;  
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({success: false,
      result: "Este almacen no esta configurado"}); 
  }
  let query = "";
  let json_result_salida ="";
  let json_result_entrada ="";
try {  
    query = `INSERT INTO  
              almacen_movimientos 
                (id_almacen, id_insumo, id_entrega, id_responsable, cantidad, descripcion,id_admidet)
              VALUES
                (?,?,?,?,?,?,?)`;
    json_result_salida = await retornar_query(query, 
            [ almacen_salida_final, 
              id_insumo, 
              id_entrega, 
              id_responsable,
              Number(cantidad*(-1)),              
              descripcion,
              id_admidet]); 

    json_result_entrada = await retornar_query(query, 
                [ almacen_destino, 
                  id_insumo, 
                  id_entrega, 
                  id_responsable,
                  cantidad,              
                  descripcion_salida,
                  id_admidet]); 
  
   
} catch (error) {
  query = `DELETE FROM  
              almacen_movimientos 
          WHERE id_admidet =?`;
    json_result_salida = await retornar_query(query, 
            [ id_admidet]); 
  query = `DELETE FROM  
            admisiones_det 
        WHERE id_admidet =?`;
  json_result_entrada = await retornar_query(query, 
          [ id_admidet]); 
  res.status(500).json({ error: error,
    almacen:json_result_salida,
    detalle:json_result_entrada
  });  
}

res.json({ 
  success: true,
  salida:json_result_salida,
  entrada:json_result_entrada
});

});

app.post('/api/devol_inventario',  async (req, res) => {
  const result = req.body;

  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }

  const { almacen_salida,     
    id_insumo, 
    insumo,
    id_responsable,
    cantidad,
    descripcion,
    descripcion_salida,
    id_admidet, id_cli, usuario } = result;

  // Validate numeric fields
  const numericFields = { almacen_salida, id_insumo, id_responsable, cantidad, id_admidet, insumo };
  for (const [key, value] of Object.entries(numericFields)) {
    if (isNaN(value)) {
      return res.status(400).json({ error: `DI${key}-01` });
    }
  }

  let query = "";
  let json_result_salida ="";
  let json_result_devolucion ="";
  let json_result_admision ="";
try {  
  if(insumo==1){
    query = "SELECT id_entrega FROM almacen_movimientos WHERE id_admidet=? limit 1"
    
    let json_entrega =  await retornar_query(query, [ id_admidet ]);

    if (!json_entrega[0]?.id_entrega) {
        return res.status(400).json({ error: 'id_entrega error' });
    }
    
    query = `INSERT INTO  
        almacen_movimientos 
          (id_almacen, id_insumo, id_entrega, id_responsable, cantidad, descripcion,id_admidet)
        VALUES
          ((SELECT id_consultorio FROM consultorios WHERE descripcion='RESERVA' AND id_cli =? limit 1),?,?,?,?,?,?)`;
   
    json_result_salida = await retornar_query(query, 
      [ id_cli, 
        id_insumo, 
        json_entrega[0].id_entrega, 
        id_responsable,
        Number(cantidad*(-1)),              
        descripcion,
        id_admidet]); 

    query = `INSERT INTO  
        almacen_movimientos 
          (id_almacen, id_insumo, id_entrega, id_responsable, cantidad, descripcion,id_admidet)
        VALUES
      ((SELECT id_consultorio FROM consultorios WHERE descripcion='DEVOLUCIONES' AND id_cli =? limit 1),?,?,?,?,?,?)`;

    json_result_devolucion = await retornar_query(query, 
          [ id_cli, 
            id_insumo, 
            json_entrega[0].id_entrega,
            id_responsable,
            cantidad,              
            descripcion_salida,
            id_admidet]); 
  }
  
      query = `UPDATE admisiones_det SET activo=0, nota='Eliminado por: ${usuario}' 
              WHERE id_admidet =?`;
            
      json_result_admision = await retornar_query(query, 
                [ 
                                    id_admidet,                  
                ]);   
      return res.json({
        admision: json_result_admision,
        almacen: json_result_salida,
        detalle: json_result_devolucion
      });
  } catch (error) {
registrarErrorPeticion(req, error)
    res.status(500).json({ error: error.message })
  }
 
});

app.get('/api/promociones_admi', async (req, res) => {
  const { admisiones } = req.query; 
  
  if(admisiones=='' || admisiones===null){
    res.status(500).json({ error: 'PA01' }); //promo no enviada
    return
  }

    let admisionesArr = admisiones.split(',').map(numero => parseInt(numero.trim(),10));
  
    const admisionesPlaceholders = admisionesArr.map(() => '?').join(',');

  let query_honorario = contenedor_query[1][6] + ` WHERE ad.id_admision in (${admisionesPlaceholders})`
 
  const result = await retornar_query( query_honorario, [...admisionesArr]);
if(result.error){
  return res.json({success: false,
    resultados: "sin descuentos"});
}
  res.json({success: true,
    resultados: result});
});

app.get('/api/almacenes/listado_med_grupos', async (req, res) => {
  const {almacen, grupo } = req.query; 
  
  if(grupo=='' || grupo===null){
    res.status(500).json({ error: 'LG01' }); //listado no enviada
    return
  }

  if(almacen=='' || almacen===null){
    res.status(500).json({ error: 'LG02' }); //listado no enviada
    return
  }

  let query_salida = `Select id_almacen from almacenes_consultorio where id_consultorio =?`; 
  let almacen_salida_final =await retornar_query(query_salida,[almacen]);
  try {
    almacen_salida_final = almacen_salida_final[0].id_almacen;  
  } catch (error) {
    registrarErrorPeticion(req, "Este almacen no esta configurado")
    return res.json({success: false,
      result: "Este almacen no esta configurado"}); 
  }
  

  let query_listado = `
  SELECT 
      am.id_insumo,
      e.descripcion AS insumo,
      e.id_grupo_estudio AS grupo_estudio,
      e.activo,
      c.descripcion AS almacen,
      SUM(am.cantidad) AS cantidad,
      am.id_almacen
  FROM almacen_movimientos am
  INNER JOIN estudios e
      ON e.id_estudio = am.id_insumo
  INNER JOIN consultorios c
      ON c.id_consultorio = am.id_almacen
  WHERE 
      am.id_almacen = ?
      AND e.activo = 1
      AND e.id_grupo_estudio = ?
  GROUP BY 
      am.id_insumo,
      e.descripcion,
      e.id_grupo_estudio,
      e.activo,
      c.descripcion,
      am.id_almacen
  HAVING 
      SUM(am.cantidad) > 0
  ORDER BY
      e.descripcion;`; 
  const result = await retornar_query( query_listado, [almacen_salida_final,grupo]);
  if(result.error){
    let query =`
    SELECT id_estudio as id_insumo,
          descripcion as insumo from estudios 
          where activo='1' and id_grupo_estudio =?`
    let resultado = await retornar_query( query, [grupo]);
    return res.json({success: false,
      result: resultado});
  }
  res.json({success: true,
    result});
});

async function historico_precios(admidet){
  let query_historico = `
    INSERT INTO 
      historico_precios (id_admidet, precio, precio_usd,  tasa, id_usuario)
    SELECT
      id_admidet, precio, precio_usd,  cambio, id_usuario
    FROM
      admisiones_det
    WHERE
      id_admidet = ?
  `;
  const result = await retornar_query(query_historico, [admidet]);
  return result;
}

app.patch('/api/cambio-precios-admision', authenticateToken, async (req, res) => {
  const { admidet, tasa, precio, precio_usd, id_usuario } = req.body; 
  
  if(admidet=='' || admidet===null){
    res.json({success:false, error: 'CPA01' }); //promo no enviada
    return
  }

let admidet_status = `
SELECT 
  id_status_cierre 
FROM
  admisiones
WHERE
  id_admision = (SELECT id_admision FROM admisiones_det WHERE id_admidet = ?)`

let result_status = await retornar_query(admidet_status, [admidet]);

if(result_status[0].id_status_cierre!=1){
  return res.json({success:false, error: 'La admision esta cerrada' }); //Admision cerrada
}

  let historico = await historico_precios(admidet);

  if(historico.error){
    return res.json({success:false, error: 'CPA02'  })
  }

  let query = `
    UPDATE admisiones_det
    SET precio = ?, precio_usd = ?, cambio = ?, id_usuario = ?
    WHERE id_admidet = ?`;
    
  const result = await retornar_query( query, [precio, precio_usd, tasa, id_usuario, admidet]);

if(result.error){
  return res.json({success: false, error: 'CPA03'});
}
    if (req.requestId) {
      await registrarFinPeticion(req.requestId);
    }
  res.json({success: true,
    resultados: result});
});

app.get('/api/historico_precios', async (req, res) => {
  const { admidet } = req.query; 
  
  if(admidet=='' || admidet===null){
    res.json({ success: false, error: 'HP01' }); //ADMIDET NO enviada
    return
  }
  let query_historico = `
  SELECT 
    hp.*,
    u.usuario
  FROM 
    historico_precios hp
  INNER JOIN
    usuarios u ON hp.id_usuario = u.id
  WHERE 
    hp.id_admidet = ?`
 
  const result = await retornar_query( query_historico, [admidet]);

  if(result.error){
    res.json({ success: true, 
      error: 'No existe historico para este detalle' });
    return
  }  

  let query = `
  SELECT
     ad.precio, ad.cambio as tasa, ad.precio_usd,  ad.id_usuario, u.usuario, ad.fecha_detalle as fecha_creacion
    FROM
      admisiones_det ad
  INNER JOIN
    usuarios u ON ad.id_usuario = u.id
  WHERE 
    ad.id_admidet = ?`
 
  let result_actual = await retornar_query( query, [admidet]);
result.push(result_actual[0])
  res.json({success: true,
    resultados: result});
});

app.get('/api/estudios-filtrados', async (req, res)=> {
  const {id_cli, id_medico, dia} =req.query;
  if (!id_cli || !id_medico || !dia) {
    return res.status(400).json({ error: 'Todos los parámetros son requeridos.' });
  }
  if (isNaN(id_cli) || isNaN(id_medico) || isNaN(dia)) {
    return res.status(400).json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  let dia_query = '';
  switch (Number(dia)) {
    case 0:
      dia_query = 'epm.dom=1';
      break;
    case 1:
      dia_query = 'epm.lun=1';
      break;
    case 2:
      dia_query = 'epm.mar=1';
      break;
    case 3:
      dia_query = 'epm.mie=1';
      break;
    case 4:
      dia_query = 'epm.jue=1';
      break;
    case 5:
      dia_query = 'epm.vie=1';
      break;
    case 6:
      dia_query = 'epm.sab=1';
      break;
    default:
      return res.status(400).json({ error: 'Día inválido.' });
  }

  let query =`
    SELECT
      e.id_estudio,
      e.descripcion,
      epm.activo, 
      epm.id
    FROM 
      estudios e
    INNER JOIN
      estudios_por_medicos epm ON e.id_estudio = epm.id_estudio
    WHERE
      e.activo=1 AND
      epm.activo=1 AND
      epm.id_medico = ? AND
      epm.id_cli = ? AND
      ${dia_query}`
    
  let estudios = await retornar_query(query,[id_medico, id_cli]);

  if(estudios.error){
    query = `SELECT id_estudio, descripcion FROM estudios WHERE activo=1 AND id_cli=?`
    estudios = await retornar_query(query,[id_cli]);
  }
  res.json({ success: true, result: estudios });

})

app.get('/api/config-filtro-estudios',  async (req,res)=>{
  const { id_cli, id_medico } = req.query;
  if (!id_cli ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }
  if (isNaN(id_cli) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  if(id_medico==0){
      let query_medicos = 
            `SELECT
              m.id_medico,
              CONCAT(m.nombre, ' ', m.apellido) as medico,
              mc.codigo
            FROM
              medicos m
            INNER JOIN
              medicos_clinicas mc ON m.id_medico = mc.id_med
            WHERE
              mc.id_cli = ? AND
              m.activo = 1`
      let medicos = await retornar_query(query_medicos,[id_cli]);

    return res.json({ success: true,
                        medicos: medicos });
  }else{
    let query =`
    SELECT
      e.id_estudio,
      e.descripcion,
      epm.*
    FROM 
      estudios e
    INNER JOIN
      estudios_por_medicos epm ON e.id_estudio = epm.id_estudio
    WHERE
      e.activo=1 AND
      epm.id_medico = ? AND
      epm.id_cli = ?`

    let result = await retornar_query(query,[id_medico, id_cli]);
  
    return res.json({ success: true,
                        result: result });
                       
  }
})
app.delete('/api/config-filtro-estudios', authenticateToken, async (req,res)=>{
  const { id_epm } = req.query;
  if (!id_epm ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }
  if (isNaN(id_epm) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }
 
    let query =`
    DELETE FROM 
      estudios_por_medicos
    WHERE
      id  = ?`

    let result = await retornar_query(query,[id_epm]);
  
    return res.json({ success: true,
                        result: result });
                       

})

app.post('/api/planes', authenticateToken, async (req,res)=>{
  const { id_medico, id_crear, modo } = req.body;
  
  if (!id_medico ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }

  if (isNaN(id_medico) ||isNaN(id_crear) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  let query ="";
  switch (modo) {
    case 'estudio':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_estudio = ? and activo=1;
      `;
      break;
    case 'tipo':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_tipo_estudio = ? and activo=1;
      `;
      break;
    case 'grupo':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_grupo_estudio = ? and activo=1;
      `;
      break;
    default:
      return res.json({ error: 'modo inválido.' });
    }
     
try {
  let restriccion = await retornar_query(query,[id_crear]);
      return res.json({ success: true,
                        result: restriccion });

} catch (error) {
registrarErrorPeticion(req, error)
  return res.json({ success: false,
                        result: error });
}
})

app.patch('/api/config-filtro-estudios', authenticateToken, async (req,res)=>{
  const { ident, dia, activo } = req.body;
  
  if (!ident ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }
  if (isNaN(ident) ||isNaN(dia) ||isNaN(activo) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  let dia_query ="";
  switch (Number(dia)) {
    case 0:
      dia_query = 'dom';
      break;
    case 1:
      dia_query = 'lun';
      break;
    case 2:
      dia_query = 'mar';
      break;
    case 3:
      dia_query = 'mie';
      break;
    case 4:
      dia_query = 'jue';
      break;
    case 5:
      dia_query = 'vie';
      break;
    case 6:
      dia_query = 'sab';
      break;
    default:
      return res.json({ error: 'Día inválido.' });
  }

     let query = 
            `UPDATE 
              estudios_por_medicos
            SET 
              ${dia_query} = ?
            WHERE
              id = ?`
try {
  let medicos = await retornar_query(query,[activo, ident]);
      return res.json({ success: true,
                        medicos: medicos });

} catch (error) {
registrarErrorPeticion(req, error)
  return res.json({ success: false,
                        medicos: error });
}
      





})

app.post('/api/config-filtro-estudios', authenticateToken, async (req,res)=>{
  const { id_medico, id_crear, modo } = req.body;
  
  if (!id_medico ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }

  if (isNaN(id_medico) ||isNaN(id_crear) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  let query ="";
  switch (modo) {
    case 'estudio':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_estudio = ? and activo=1;
      `;
      break;
    case 'tipo':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_tipo_estudio = ? and activo=1;
      `;
      break;
    case 'grupo':
      query = `
      INSERT INTO estudios_por_medicos (id_estudio, id_medico, id_cli)
      SELECT id_estudio, ${id_medico}, id_cli
      FROM estudios
      WHERE id_grupo_estudio = ? and activo=1;
      `;
      break;
    default:
      return res.json({ error: 'modo inválido.' });
    }
     
try {
  let restriccion = await retornar_query(query,[id_crear]);
      return res.json({ success: true,
                        result: restriccion });

} catch (error) {
registrarErrorPeticion(req, error)
  return res.json({ success: false,
                        result: error });
}
      





})

app.post('/api/admisiones_abrir', authenticateToken, async (req,res)=>{
  const { id_admision } = req.body;
  
  if (!id_admision ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }

  if (isNaN(id_admision)) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }

  let query =`UPDATE admisiones 
              SET 
                id_status_cierre=1, 
                motivo_cierre=NULL, 
                fecha_cierre=NULL, 
                nota='',
                id_usuario_cierre=NULL,
                factura=NULL 
              WHERE 
                id_admision=?
      `;
     
try {
  let abrir = await retornar_query(query,[id_admision]);
      return res.json({ success: true,
                        result: abrir });

} catch (error) {
registrarErrorPeticion(req, error)
  return res.json({ success: false,
                        result: error });
}
      





})

async function verificar_stocks(tipo, id, zona) {

  let query = '';
  switch (tipo) {
    case 'med':
        query = `
          SELECT     
            sum(cantidad) AS cantidad
          FROM
            almacen_movimientos
          WHERE
            id_insumo=? AND
            id_almacen IN 
              (select 
                id_almacen 
              from 
                almacenes_consultorio 
              where id_consultorio =?)
          `;
          break;
  
    default:
      break;
  }

    const params = [ id,
      zona];
    try {
      const result = await retornar_query(query, params);
      return result
    } catch (error) {
      return error
    }    
}

app.get('/api/verificar-stock-medicamento',  async (req,res)=>{
    const { id_medicamento,id_consultorio, tarifa  } = req.query;

    // Validar que los parámetros sean numéricos
    if (!id_consultorio || isNaN(id_consultorio)) {
      return res.status(400).json({ error: 'El parámetro consultorio esta mal formateado.' });
    }
    if (!id_medicamento || isNaN(id_medicamento)) {
      return res.status(400).json({ error: 'El parámetro medicamento esta mal formateado.' });
    }

    let resultado = await verificar_stocks('med',id_medicamento,id_consultorio)

    let cantidad = resultado[0]?.cantidad ?? 0

    if(cantidad==0){
      return res.json({ success: true, stock: cantidad, precio:  0  });
    }

    switch (tarifa) {
      case "P":
        tipo = "1";
        break;
      case "S":
        tipo = "2";
        break;
      case "E":
        tipo = "3";
        break;
      case "I":
        tipo = "4";
        break;
      default:
        tipo = "1";
        break;
    }

    let query = `
    SELECT
     precio
    FROM
      baremo_insumo
    WHERE 
      id_estudio=? and id_tarifa=? and activo=1
    `

    let precio = await retornar_query(query,[id_medicamento,tipo])

    res.json({ success: true, stock: cantidad, precio: precio[0]?.precio ?? 0  });      
})

app.put('/api/mobile/cambiar-foto-perfil',   (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Campo de archivo inesperado' });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Nombre de usuario requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    // Validar tamaño del archivo original
    let optimizedImageBuffer = req.file.buffer;
    let fileSizeInMB = req.file.size / (1024 * 1024);

    // Si pesa más de 5 MB, optimizamos
    if (fileSizeInMB > 5) {
      optimizedImageBuffer = await sharp(req.file.buffer)
        .resize({ width: 1920 }) // Ajustar ancho máximo
        .jpeg({ quality: 70 })   // Compresión JPEG
        .png({ compressionLevel: 6 }) // Compresión PNG
        .toBuffer();
    }

    // Guardar la imagen en disco (ejemplo)
    const uploadPath = path.resolve(__dirname, 'uploads', `${username}-perfil.jpg`);
    
    fs.writeFileSync(uploadPath, optimizedImageBuffer);

    let query = `
    UPDATE usuarios SET foto=? WHERE usuario=?
    `
    let result = await retornar_query(query,[`${username}-perfil.jpg`, username])

    res.json({
      message: 'Foto de perfil actualizada correctamente',
      size: optimizedImageBuffer.length / (1024 * 1024),
      result
    });

  } catch (error) {
registrarErrorPeticion(req, error)
    
    res.status(500).json({ error: error.message || 'Error al procesar la imagen' });
  }
});

app.get('/api/mobile/citas-medico', authenticateToken, async (req,res)=>{
    const { id_medico  } = req.query;
    // Validar que los parámetros sean numéricos
    if (!id_medico || isNaN(id_medico)) {
      return res.status(400).json({ error: 'El parámetro medico esta mal formateado.' });
    }
    
    let query = `
    SELECT
     c.id_calendario as id,
     c.start as time,
     CONCAT(TIMESTAMPDIFF(MINUTE, c.start, c.end), ' min.') AS duration,
     c.title as patientName,
     CASE 
        WHEN c.tipo_consulta = 'P' THEN 'particular'
        WHEN c.tipo_consulta = 'E' THEN 'empresas'
        WHEN c.tipo_consulta = 'S' THEN 'seguros'
        WHEN c.tipo_consulta = 'I' THEN 'interno'
        ELSE 'Desconocido'
      END AS type,
      pub.apellidos as location,
      c.status_ag as status,
      p.telef1 as phone,
       GROUP_CONCAT(DISTINCT e.descripcion SEPARATOR '; ') AS estudio
    FROM
      calendarios c
    INNER JOIN
      perfil_usuario_basico pub ON c.id_cli = pub.id_usuario
    INNER JOIN
      pacientes p ON c.id_paciente = p.id_paciente
    LEFT OUTER JOIN estudios_agenda ea ON ea.id_agenda = c.id_calendario
    LEFT OUTER JOIN estudios e ON e.id_estudio = ea.id_estudio
    WHERE 
      c.id_medico = ? 
      AND c.activo = 1 
      AND c.tipo_consulta NOT IN ('B', 'L')
    `
    let agrupador = `
    GROUP BY
    	c.id_calendario, c.start, c.end, c.title, c.tipo_consulta,
      pub.apellidos, c.status_ag, p.telef1
    `

    let today = await retornar_query(`${query} AND DATE(c.start) = CURDATE() ${agrupador} ORDER BY c.start ASC ` ,[id_medico])
    let upcoming = await retornar_query(`${query} AND DATE(c.start) > CURDATE() ${agrupador} ORDER BY c.start ASC ` ,[id_medico])
    let past = await retornar_query(`${query} AND DATE(c.start) < CURDATE() ${agrupador} ORDER BY c.start DESC LIMIT 50  ` ,[id_medico])
    const pastCount = Array.isArray(past) ? past.length : 0;
    const actualCount = Array.isArray(today) ? today.length : 0;
    const futureCount = Array.isArray(upcoming) ? upcoming.length : 0;
    res.json({ success: true,actualCount, today, futureCount,upcoming,pastCount, past });      
})

app.delete('/api/mobile/cita',authenticateToken, async (req,res)=>{
  const { id } = req.query;
  if (!id ) {
    return res.json({ error: 'Todos los parámetros son requeridos.' });
  }
  if (isNaN(id) ) {
    return res.json({ error: 'Todos los parámetros deben ser numéricos.' });
  }
 
    let query =`
    UPDATE calendarios 
    SET 
      activo=0,
      status_ag='Cancelado',
      descripcion=CONCAT(descripcion, ' Cacelado por el especialista'),
      color='#000000'
    WHERE
      id_calendario  = ?`
    try {
      let result = await retornar_query(query,[id]);
  
      return res.json({ success: true,
                          result: result });
    } catch (error) {
registrarErrorPeticion(req, error)
      return res.json({ success: false,
                          message: error });
    }
})

app.get('/api/mobile/clinicas_med', authenticateToken, async (req,res)=>{
    const { id_medico  } = req.query;
    // Validar que los parámetros sean numéricos
    if (!id_medico || isNaN(id_medico)) {
      return res.status(400).json({ error: 'El parámetro medico esta mal formateado.' });
    }
    
    let query = `
    select  
      mc.id_med, 
      mc.id_cli, 
      pue.logo_empresa, 
      pue.apellidos 
    FROM 
      medicos_clinicas mc 
    INNER JOIN 
      perfil_usuario_empresa pue ON pue.id_usuario_empresa=mc.id_cli 
    WHERE mc.id_med = ?
    `
    try {
      let clinicas = await retornar_query(query,[id_medico])
      res.json({ success: true,clinicas });      
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,error });
    }
      
})
app.patch('/api/estudios-metodo-procesamiento',  async (req, res) => {
  
  const result = req.query;
  
  if (isNaN(result.id_estudio) || isNaN(result.id_metodo)) {
    return res.status(400).json({ error: 'AEM01',result }); 
  }
 
  let query = `SELECT id FROM estudios_metodos_procesamiento
                  WHERE id_estudio=?`;
try {
 
  let id_metodo = await retornar_query(quer, [result.id_estudio]);
  
  if(id_metodo.error){
    query_estudios_muestras = 
      `INSERT INTO 
        estudios_metodos_procesamiento (id_metodo, id_estudio, activo) 
      VALUES (?,?, 1)`;
    id_metodo = await retornar_query(query_estudios_muestras, [result.id_metodo, result.id_estudio]);
    if(id_metodo.error){
      res.status(500).json({ error: 'AEM02' }); //Error al insertar la muestra
      return
    }   
    res.json({ 
      metodo: 'insertar',
      Muestra: id_metodo.insertId }); 
  }else{
    query_estudios_muestras = 
      `UPDATE estudios_metodos_procesamiento SET id_metodo=?, activo=1 
      WHERE id_estudio=?`;
    id_metodo = await retornar_query(query_estudios_muestras, [result.id_metodo, result.id_estudio ]);
    if(id_metodo.error){
      res.status(500).json({ error: 'AEM03' }); //Error al actualizar la muestra
      return
    }    
    res.json({ 
      metodo: 'actualizar',
      Muestra: id_metodo.affectedRows }); 
  }

  
} catch (error) {    
  registrarErrorPeticion(req, error);
  res.status(500).json({ error: error });
  return
}
});

app.post('/api/mobile/crear-cita', authenticateToken,  async (req, res) => {
  const result = await registrarCita(req.body);
  
  if (result.error ){
    return res.status(422).json({error: JSON.parse(result.error.message)})
  }
  const filtros = { ...result.data }

  let query_ti ='';
  let filtros_t ='';

  switch (req.body.tipo_consulta) {
    case 'P':
      break;
    case 'I':       
      break;
    case 'S':
      query_ti='id_seguro,'
      filtros_t=req.body.tipo_sel + ','
      break;
    case 'E':
      query_ti='id_empresa,'
      filtros_t=req.body.tipo_sel + ','
      break;
    default:
      return res.json({error: `No se envio el tipo de admision correctamente: ${req.body.tipo_consulta}`})
      
  }

  let query_pac = `INSERT INTO calendarios
                      (tipo_consulta,
                      color,
                      status_ag,
                      borderColor,
                      id_cli,
                      title,
                      descripcion, 
                      id_paciente,
                      id_medico,
                      start,
                      ${query_ti}
                      end, id_usuario_crea,id_usuario_modif)                     
                  VALUES (?,'#198754','Agendado','#ffc107',?,?,?,?,?,?,${filtros_t} ?,?,?)`;
try {
  
  let cita = await retornar_query(query_pac, [req.body.tipo_consulta, filtros.id_cli, filtros.title, 
      filtros.nota, filtros.id_paciente, filtros.id_med, filtros.fecha_inicio, filtros.fecha_fin, filtros.id_med, filtros.id_med]);
   
 if(!isNaN(cita.insertId)){
  let estudio = `INSERT INTO estudios_agenda (id_estudio, id_agenda) VALUES (?,?)`
    estudio = await retornar_query(estudio,[req.body.estudios, cita.insertId ])
  return res.json({ success: true,
                    id_cita: cita.insertId,
                    id_estudio: estudio.insertId,
                   });
  }      
  
  
} catch (error) {
registrarErrorPeticion(req, error)  
  
  res.json({ success: true,
              error: error });
  return
}
});

app.get('/api/portal-med/notificaciones-med',  async (req, res) => {
  const {id_med = 0, id_cli, page=1, perPage = 5  } = req.query;
  const offset = (page - 1) * perPage;
  if(isNaN(perPage)){
    perPage =5
  }
  if (!id_cli) {
    return res.status(400).json({ error: 'Falta el id en la consulta' });
  }
 
let query_ti = `SELECT * 
                      FROM notificaciones_med 
                      WHERE id_cli = ? AND activo=1
                      ORDER BY fecha DESC
                      LIMIT ${perPage} OFFSET ?`;
let query_con = `SELECT count (*) as total
                      FROM notificaciones_med 
                      WHERE id_cli = ? AND activo=1
                      ORDER BY fecha DESC`;
try {
  let confirmacion = 0
  if(id_med!=0){
    let query_conf = `
      SELECT 
        news_med
      FROM
        perfil_usuario_basico 
      WHERE
        id_especialista=?
    `;
    confirmacion = await retornar_query(query_conf, [id_med]);
    if(Number(confirmacion[0].news_med)===0){
        return res.json({ success: true,
                    mostrar:0})
    }
  }

  let total = await retornar_query(query_con, [id_cli]);

  if(total.error){
    return res.json({ success: false, error: 'Error al obtener el total de notificaciones' });
  }
  if(Number(total[0].total)===0){
    return res.json({ success: true, notificaciones: [], total: 0 });
  }

  const total_notificaciones = Number(total[0].total) || 0;
  const totalPages=  (Math.ceil(total_notificaciones / perPage)<=10)?Math.ceil(total_notificaciones / perPage):10;

  let notificaciones = await retornar_query(query_ti, [id_cli, offset]);
  let mostrar_news =1
  if (id_med!=0 && confirmacion.length>0){
    mostrar_news = Number(confirmacion[0].news_med)||1
  }
  return res.json({ success: true,
                    notificaciones,
                    mostrar: mostrar_news,
                    pagination: {
                        page,
                        perPage,
                        totalPages,
                        total_notificaciones
                      }
                   }); 
  
} catch (error) {
registrarErrorPeticion(req, error)    
  res.json({ success: false,
              error: error,
            total: 0 });
  return
}
});

app.put('/api/portal-med/mostrar-notificaciones-med', authenticateToken, async (req, res) => {
  const {id_usr, mostrar } = req.query;

  if (!id_usr) {
    return res.status(400).json({ error: 'Falta el id en la consulta' });
  }
if (mostrar !== '0' && mostrar !== '1' && mostrar !== 0 && mostrar !== 1) {
  return res.status(400).json({ error: 'El parámetro mostrar debe ser 1 o 0' });
}
let query_ti = `UPDATE
                  perfil_usuario_basico
                SET
                  news_med =?
                WHERE id_usuario = ?`;
try {

  let result = await retornar_query(query_ti, [mostrar, id_usr]);
  
  return res.json({ success: true,
                    result,
                   });
  } catch (error) {
registrarErrorPeticion(req, error)
    res.json({ success: false,
                error: error,
                mostrar, id_usr
   });
    return
}
});

app.delete('/api/portal-med/notificaciones-med', authenticateToken, async (req, res) => {
  const {id_notif } = req.query;

  if (!id_notif) {
    return res.status(400).json({ error: 'Falta el id en la consulta' });
  }

let query_ti = `DELETE FROM
                  notificaciones_med
                WHERE id = ?`;
try {

  let result = await retornar_query(query_ti, [id_notif]);
  
  return res.json({ success: true,
                    result,
                   });
  } catch (error) {
registrarErrorPeticion(req, error)
    res.json({ success: false,
                error: error,
                id_notif
   });
    return
}
});

app.post('/api/portal-med/notificaciones-med', authenticateToken, async (req, res) => {
  const {notificacion, id_cli } = req.body;

  if (!id_cli) {
    return res.status(400).json({ error: 'Falta el id en la consulta' });
  }

  let query_ti = `INSERT INTO
                    notificaciones_med (notificacion, id_cli)
                  VALUES (?, ?)`;
  let query_ti_mostrar = `UPDATE
                  perfil_usuario_basico
                SET
                  news_med =?
                WHERE id_usuario_empresa = ?`;
  try {

    retornar_query(query_ti_mostrar, [1, id_cli]);

    let result = await retornar_query(query_ti, [notificacion, id_cli]);

    return res.json({ success: true,
                      result,
                    });
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                  error: error                
    });
  }
});
app.patch('/api/agendas/reprogramar', authenticateToken, async (req, res) => {
  const {id_cal, start, end, usuario, motivo=3 } = req.body;

  if (!id_cal) {
    return res.status(400).json({ error: 'Falta el id en la consulta' });
  }


  let query = `UPDATE
                  calendarios
                SET
                  start =?, end=?, id_usuario_modif =?, motivo_reag=?, status_ag='Reagendado', id_reagendador=?
                WHERE id_calendario = ?`;
  try {

  let result = await retornar_query(query, [ start, end, usuario, motivo, usuario, id_cal]);

  return res.json({ success: true,
                    result,
                   });
  } catch (error) {
registrarErrorPeticion(req, error)
    res.json({ success: false,
                error: error                
   });
}
});
app.post('/api/agendas/reporte_status',  async (req, res) => {
    const { fecha_inicio, fecha_fin, id_medico, id_cli } = req.body;
      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Fechas de inicio y fin son requeridas' });
      }
      let query_consulta = `
              SELECT
                c.id_calendario,
                CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
                COALESCE(GROUP_CONCAT(DISTINCT e.descripcion SEPARATOR '; '), 'Sin estudios') AS estudios,
                DATE_FORMAT(c.start, '%Y-%m-%d') AS fecha,
                DATE_FORMAT(c.start, '%H:%i') AS hora,
                c.status_ag,
                CASE 
                    WHEN c.motivo_reag IS NULL THEN 'No reprogramada'
                    WHEN c.motivo_reag = 0 THEN 'Sin Especificar'
                    WHEN c.motivo_reag = 1 THEN 'Reprogramada por el Médico'
                    WHEN c.motivo_reag = 2 THEN 'Reprogramada por el Paciente'
                    WHEN c.motivo_reag = 3 THEN 'Reprogramada por el Usuario'
                END AS motivo_reprogramacion,
                u.usuario AS reprogramado_por
            FROM calendarios c
            JOIN pacientes p ON c.id_paciente = p.id_paciente
            LEFT JOIN estudios_agenda ea ON c.id_calendario = ea.id_agenda
            LEFT JOIN estudios e ON ea.id_estudio = e.id_estudio
            LEFT JOIN usuarios u ON c.id_reagendador = u.id
            WHERE  c.start BETWEEN ? AND ?
                AND (? IS NULL OR c.id_medico = ?)
                AND c.id_cli = ?
            GROUP BY c.id_calendario
            ORDER BY c.start
      `
      let query_resumen_motivo = `
            SELECT
              CASE 
                  WHEN c.motivo_reag IS NULL THEN 'No reprogramada'
                  WHEN c.motivo_reag = 0 THEN 'Sin Especificar'
                  WHEN c.motivo_reag = 1 THEN 'Reprogramada por el Médico'
                  WHEN c.motivo_reag = 2 THEN 'Reprogramada por el Paciente'
                  WHEN c.motivo_reag = 3 THEN 'Reprogramada por el Usuario'
              END AS motivo_reprogramacion,
              COUNT(*) AS cantidad
          FROM calendarios c
          WHERE c.start BETWEEN ? AND ?
              AND (? IS NULL OR c.id_medico = ?)
              AND c.id_cli = ?
          GROUP BY motivo_reprogramacion;`
      let query_resumen_status = `
          SELECT
              c.status_ag,
              COUNT(*) AS cantidad
          FROM calendarios c
          WHERE c.start BETWEEN ? AND ?
              AND (? IS NULL OR c.id_medico = ?)
              AND c.id_cli = ?
          GROUP BY c.status_ag;`;
      try {
  const detallesRaw = await retornar_query(query_consulta, [fecha_inicio, fecha_fin, id_medico, id_medico, id_cli]);
  const resumenStatusRaw = await retornar_query(query_resumen_status, [fecha_inicio, fecha_fin, id_medico, id_medico, id_cli]);
  const resumenMotivoRaw = await retornar_query(query_resumen_motivo, [fecha_inicio, fecha_fin, id_medico, id_medico, id_cli]);

  const detalles = Array.isArray(detallesRaw) ? detallesRaw : [];
  const resumenStatus = Array.isArray(resumenStatusRaw) ? resumenStatusRaw : [];
  const resumenMotivo = Array.isArray(resumenMotivoRaw) ? resumenMotivoRaw : [];

  // Resumen por status_ag (ya viene como texto legible)
  const statusAgrupado = resumenStatus.reduce((acc, item) => {
    acc[item.status_ag] = item.cantidad;
    return acc;
  }, {});

  // Resumen por motivo_reag
  const motivoAgrupado = resumenMotivo.reduce((acc, item) => {
    acc[item.motivo_reprogramacion] = item.cantidad;
    return acc;
  }, {});

  res.json({
    detalle: detalles,
    resumen: {
      status_ag: statusAgrupado,
      motivo_reag: motivoAgrupado
    }
  });

  } catch (error) {
registrarErrorPeticion(req, error)
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
})

app.get('/api/mobile/perfil-medico',  async (req,res)=>{
    const { id_medico  } = req.query;
    // Validar que los parámetros sean numéricos
    if (!id_medico || isNaN(id_medico)) {
      return res.status(400).json({ error: 'El parámetro medico esta mal formateado.' });
    }
    
    let query = `SELECT
    m.nombre AS nombres,
    m.apellido AS apellidos,
    m.titulo,
    m.cedula_p AS cedula_profesional,
    m.cedula,
    m.telefono,
    m.sexo,
    CASE
        WHEN GROUP_CONCAT(DISTINCT e.descripcion SEPARATOR '; ') IS NULL THEN 'No hay especialidades registradas'
        ELSE GROUP_CONCAT(DISTINCT e.descripcion SEPARATOR '; ')
    END AS especialidades
FROM
    medicos m
LEFT JOIN med_esp me ON me.id_medico = m.id_medico
LEFT JOIN especialidades e ON e.id_especialidad = me.id_especialidad
WHERE m.id_medico = ?
GROUP BY
    m.id_medico, m.nombre, m.apellido, m.titulo, m.cedula_p, m.cedula, m.telefono, m.sexo;` 

    try {
      let perfil = await retornar_query(query,[id_medico])
    
      res.json({ success: true,
                perfil});    
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                error: error})    
    }
      
})

app.patch('/api/mobile/perfil-medico', authenticateToken,  async (req,res)=>{
    const { id_medico, campo, data  } = req.query;
    // Validar que los parámetros sean numéricos
    if (!id_medico || isNaN(id_medico)) {
      return res.status(400).json({ error: 'El parámetro medico esta mal formateado.' });
    }
    
    const camposPermitidos = [
      "nombres",
      "apellidos",
      "titulo",
      "cedula_profesional",
      "cedula",
      "telefono",
      "sexo"
    ];

    if (!campo || !camposPermitidos.includes(campo)) {
      return res.status(400).json({ error: 'Campo no permitido.' });
    }

    let campoBD = campo === "cedula_profesional" ? "cedula_p" : campo;

    let queryUpdate = `UPDATE medicos SET ${campoBD} = ? WHERE id_medico = ?`;

    try {
      await retornar_query(queryUpdate, [String(data).toUpperCase(), id_medico]);
      res.json({ success: true,
                queryUpdate});
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                error: error}) 
    }      
})

app.get('/api/mobile/pacientes-medico', authenticateToken, async (req,res)=>{
    const { id_medico, page = 1, perPage = 5, cedula, paciente  } = req.query;
    const offset = (page - 1) * perPage;
    // Validar que los parámetros sean numéricos
    if (!id_medico || isNaN(id_medico)) {
      return res.status(400).json({ error: 'El parámetro medico esta mal formateado.' });
    }
    
    // Construir condiciones dinámicamente según los parámetros opcionales
    let condiciones = ['ad.id_medico = ?'];
    let params = [id_medico];

    if (cedula) {
      condiciones.push('p.cedula LIKE ?');
      params.push(`${cedula}%`);
    }
    if (paciente) {
      condiciones.push('LOWER(CONCAT(p.nombres, " ", p.apellidos)) LIKE ?');
      params.push(`%${paciente.toLowerCase()}%`);
    }

    let whereClause = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';

    let query = `SELECT 
        p.id_paciente,
        CONCAT (p.tipo_cedula, ' ',p.cedula) as cedula,
        CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
        p.fecha_nacimiento,
        p.sexo,
        p.telef1,
        TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) AS edad,
        a.fecha_admision,
        pub.apellidos AS medico,
        GROUP_CONCAT(DISTINCT e.descripcion SEPARATOR '; ') AS estudios
      FROM admisiones a
      INNER JOIN admisiones_det ad ON ad.id_admision = a.id_admision
      INNER JOIN estudios e ON e.id_estudio = ad.id_estudio
      INNER JOIN pacientes p ON p.id_paciente = a.id_paciente
      INNER JOIN perfil_usuario_basico pub ON pub.id_usuario = a.id_cli
      ${whereClause}
      GROUP BY a.id_admision
      ORDER BY a.id_admision DESC
      LIMIT ${perPage} OFFSET ${offset};`;
    
    let query_total = `
    SELECT COUNT(*) AS total
      FROM (
          SELECT a.id_admision
          FROM admisiones a
          INNER JOIN admisiones_det ad ON ad.id_admision = a.id_admision
          INNER JOIN pacientes p ON p.id_paciente = a.id_paciente
           ${whereClause}
          GROUP BY a.id_admision
      ) AS subconsulta;   `

    try {
      
      let pacientes = await retornar_query(query, params);    
      
      let total = await retornar_query(query_total, params);
      
      if(total.error){
        return res.json({ success: false, error: 'Error al obtener el total' });
      }
      if(Number(total[0].total)===0){
        return res.json({ success: true, pacientes: [], total: 0 });
      }

      const total_pacientes = Number(total[0].total) || 0;
      const totalPages=  Math.ceil(total_pacientes / perPage)


      res.json({ success: true,
                pacientes,
                pagination: {
                          page,
                          perPage,
                          totalPages,
                          total_pacientes
                        }});    
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                error: error})    
    }
      
})

app.get('/api/mobile/pacientes-peso-talla', authenticateToken,  async (req,res)=>{
    const { id_paciente } = req.query;
   
    if (!id_paciente || isNaN(id_paciente)) {
      return res.status(400).json({ error: 'El parámetro paciente esta mal formateado.' });
    }
    
    let query = `SELECT de.id_admision, 
                        de.peso, 
                        de.talla, 
                        de.presion, 
                        de.contacto, 
                        de.trabajo, 
                        de.plan_trat, 
                        de.fecha_mod AS fecha,
                        p.id_paciente 
                    FROM datos_enfermeria de 
                      INNER JOIN 
                        admisiones a ON a.id_admision = de.id_admision 
                      INNER JOIN 
                        pacientes p on p.id_paciente = a.id_paciente 
                    WHERE 
                        p.id_paciente = ?;`;
    
    try {
      
      let pacientes_talla = await retornar_query(query, id_paciente);          
      
      if(!pacientes_talla.error){
        return res.json({ success: true,
                pacientes_talla,});    
      }
      res.json({ success: false,
                pacientes_talla: [],}); 
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                error: error})    
    }
      
})

app.get('/api/mobile/resumen-consultas',   async (req,res)=>{
    const { id_paciente } = req.query;
   
    if (!id_paciente || isNaN(id_paciente)) {
      return res.status(400).json({ error: 'El parámetro paciente esta mal formateado.' });
    }
    
    let query = `SELECT 
                    c.id_consulta,
                    COALESCE(c.motivo, c.informe_manual) AS motivo_resultado,
                    c.fecha_creacion,
                    c.id_admidet
                FROM consultas c 
                INNER JOIN admisiones_det ad 
                    ON c.id_admidet = ad.id_admidet 
                    AND ad.activo = 1
                INNER JOIN admisiones a 
                    ON ad.id_admision = a.id_admision 
                    AND a.activo = 1
                WHERE a.id_paciente = ? 
                AND (c.motivo IS NOT NULL OR c.informe_manual IS NOT NULL)`;
    
    try {
      
      let resumen = await retornar_query(query, id_paciente);          
      
      if(!resumen.error){
        return res.json({ success: true,
                resumen,});    
      }
      res.json({ success: false,
                resumen: [],}); 
    } catch (error) {
registrarErrorPeticion(req, error)
      res.json({ success: false,
                error: error})    
    }
      
})

app.post('/api/mobile/registrar-token-push', async (req, res) => {
  const { id_medico, push_token, plataforma } = req.body;

  if (!id_medico || !push_token) {
    return res.status(400).json({ success: false, error: 'Campos requeridos: id_medico, push_token' });
  }

  let query_consulta = `
    SELECT id, push_token
    FROM medic_token
    WHERE id_medico = ?
  `;

let token_type = 'unknown';
  
  if (typeof push_token === 'string') {
    if (push_token.startsWith('ExponentPushToken')) {
      token_type = 'expo';
    } else if (/^[0-9a-fA-F]{36}$/.test(push_token)) {
      token_type = 'onesignal'; // UUID-like format
    } else if (push_token.length === 161 && push_token.startsWith('fcm')) {
      token_type = 'firebase_fcm';
    }
  }


  try {
    const existingToken = await retornar_query(query_consulta, [id_medico]);
    let query_actualizar_agregar;
    let params;

    if (!existingToken.error) {
      // Actualiza si ya existe
      query_actualizar_agregar = `
        UPDATE medic_token
        SET push_token = ?, plataforma = ?, token_type = '${token_type}'
        WHERE id_medico = ?
      `;
      params = [push_token, plataforma, id_medico];
    } else {
      // Inserta nuevo registro
      query_actualizar_agregar = `
        INSERT INTO medic_token (push_token, plataforma, id_medico, token_type)
        VALUES (?, ?, ?, '${token_type}')
      `;
      params = [push_token, plataforma, id_medico];
    }

    const manejo_token = await retornar_query(query_actualizar_agregar, params);

    res.json({
      success: true,
      message: existingToken ? 'Token actualizado' : 'Token registrado',
      manejo_token
    });

  } catch (error) {
registrarErrorPeticion(req, error)
    
    res.status(500).json({ success: false, error });
  }
});

app.get('/api/agenda/manejar-notificacion', async (req, res) => {
  const { id_medico, id_cli, id_cal, logo } = req.query;

  if (!id_medico) {
    return res.status(400).json({ error: 'Campo id_medico es requerido' });
  }

  const query = `SELECT id 
                  FROM medic_push
                  WHERE id_medico = ?
                  AND id_cli = ?`;

  const id_afiliado = await retornar_query(query, [id_medico, id_cli]);

  if (!id_afiliado || id_afiliado.error) {
    return res.json({ success: false, error: 'No esta afiliado a las notificaciones' });
  }

  const query_consulta = `
    SELECT id, push_token
    FROM medic_token
    WHERE id_medico = ?
  `;

  try {
    const tokenData = await retornar_query(query_consulta, [id_medico]);

    if (!tokenData || !tokenData.push_token) {
      return res.json({ success: false, error: 'No hay token registrado' });
    }

    let url_logo = "https://siac.empresas.historiaclinica.org/"
    // logo = "../images/empresas/cenimat/logo_cenimat.webp"
     if (logo) {
      url_logo += logo.replace('../', '');
    }
    const resultado = await enviarNotificacionOneSignal(tokenData.push_token, 
      'Nueva cita asignada', 
      'Tienes una nueva cita en tu agenda.',
      {tipo: 'nueva_cita', id_cal},
      url_logo
    );

    if (resultado && resultado.data) {
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0'); 
      const currentMonthYear = `${year}-${month}`;

      const checkQuery = `
        SELECT id FROM notif_push_contadores 
        WHERE periodo = ? AND id_cli = ?
      `;

      try {
        const existingRecord = await retornar_query(checkQuery, [currentMonthYear, id_cli]);

        if (!existingRecord.error) {
            const updateQuery = `
              UPDATE notif_push_contadores 
              SET push_agenda = push_agenda + 1 
              WHERE id = ?
            `;
            await retornar_query(updateQuery, [existingRecord[0].id]);
          } else {
            const insertQuery = `
              INSERT INTO notif_push_contadores 
              (periodo, id_cli, push_agenda) 
              VALUES (?, ?, 1)
            `;
            await retornar_query(insertQuery, [currentMonthYear, id_cli]);
          }
        return res.json({
          success: true,
          data: resultado.data
          
        });
      } catch (error) {
registrarErrorPeticion(req, error)
        return res.json({
          errores:existingRecord
        })
      }
      
      
    } else {
      return res.json({
        success: false,
        error: resultado?.error || 'No se pudo enviar la notificación',
        resultado:resultado.data
      });
    }

  } catch (error) {
registrarErrorPeticion(req, error)    
    return res.status(500).json({ success: false, error: error });
  }
});

app.put('/api/agenda/evento', authenticateToken, async (req,res)=> {
  const {id_evento, turno, status, tipoConsulta, id_admision} = req.query;
  if (!id_evento ) {
    return res.status(400).json({ error: 'Campos evento es requerido' });
  }
  let query = ``;
    if(turno){
      query = `UPDATE
                admisiones
              SET
                turno=?
              WHERE  id_preadmision = ?`
      let filtro = id_evento;
      if(id_admision){
        query = `UPDATE
                admisiones
              SET
                turno=?
              WHERE  id_admision = ?`
       filtro = id_admision;
      }
      try {
          const respuesta = await retornar_query(query, [turno, filtro]);   
          return res.json({
            success:true,
            datos:respuesta
          });   
      } catch (error) {
registrarErrorPeticion(req, error)
        return res.json({
            success:false,
            datos:respuesta
          }); 
      }
    }
    let esCancelado=''
    switch (tipoConsulta) {
      case 'P':
        esCancelado =", color='#0dbcf0' "
        break;
      case 'E':
        esCancelado =", color='#f00ddf' "
        break;
      case 'I':
        esCancelado =", color='#79ffe6' "
        break;
      case 'S':
        esCancelado =", color='#30f00d' "
        break;
      default:
        break;
    }
    if(status=="Cancelado") {
        esCancelado = ", activo=0, color='#000000' "
    } 
    query = `UPDATE
          calendarios
        SET
          status_ag=? ${esCancelado}
        WHERE  id_calendario = ?`
      try {
          const respuesta = await retornar_query(query, [status, id_evento]);   
          return res.json({
            success:true,
            datos:respuesta
          });   
      } catch (error) {
registrarErrorPeticion(req, error)
        return res.json({
            success:false,
            datos:respuesta
          }); 
      }
})

app.delete('/api/agenda/evento', authenticateToken, async (req,res)=> {
  const {id_evento} = req.query;
  if (!id_evento ) {
    return res.status(400).json({ error: 'Campos evento es requerido' });
  }
  let query = ``;
     
  query = `DELETE FROM
        calendarios
      WHERE  id_calendario = ?`
    try {
        const respuesta = await retornar_query(query, [id_evento]);   
        return res.json({
          success:true,
          datos:respuesta
        });   
    } catch (error) {
registrarErrorPeticion(req, error)
      return res.json({
          success:false,
          datos:respuesta
        }); 
      }
})

app.post('/api/opciones/main', authenticateToken, async (req,res)=> {
  const { id_cli, refer} = req.body;
  if (!id_cli) {
    return res.status(400).json({ error: 'El campo id_cli es requerido' });
  }

  if (!refer || typeof refer !== 'string' || !/^[A-Z]{3}$/.test(refer)) {
    return res.status(400).json({ error: 'El campo refer debe ser un string de tres letras mayúsculas.' });
  }
  
  let query = `UPDATE opt_main SET USD_EUR = ? WHERE id_cli = ?`;
  try {
      const respuesta_actualizar = await retornar_query(query, [refer, id_cli]); 
      return res.json({
        success:true,
        actualizar:respuesta_actualizar
      });    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
        success:false,
        datos:error
      }); 
    }
})

app.get('/api/opciones/almacenes',  async (req,res)=> {
  const { id_cli } = req.query;
  if (!id_cli) {
    return res.status(400).json({ error: 'El campo id_cli es requerido' });
  }
    let query_almacenes = `SELECT 
                              consultorios.id_consultorio as ID, 
                              consultorios.descripcion as Almacen
                            FROM consultorios
                            WHERE consultorios.descripcion IN ('PRINCIPAL', 'DEVOLUCIONES', 'RESERVA')
                                and consultorios.id_cli= ?`
  try {
      const almacenes = await retornar_query(query_almacenes, [ id_cli]);       
      return res.json({
        success:true,
        almacenes
      });    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
        success:false,
        datos:error
      }); 
    }
})

app.get('/api/crm/promociones_descuentos',  async (req,res)=> {
  const { id_cli} = req.query;
  if (!id_cli) {
    return res.status(400).json({ error: 'El campo id_cli es requerido' });
  }
  
  let query = `SELECT 
                  p.*,
                  m.id_moneda AS moneda,
                  m.simbolo AS simbolo_moneda
              FROM 
                  promociones p
              JOIN 
                  monedas m ON p.id_moneda = m.id_moneda
              WHERE 
                  p.id_cli = ?
                  AND p.fecha_hasta >= CURRENT_DATE
                  AND p.fecha_desde <= CURRENT_DATE
                  AND p.codigo_cupon = ''
                  AND (p.cantidad_restante > 0 OR p.ilimitado = 1)`;
  try {
      const promos = await retornar_query(query, [ id_cli]); 
      return res.json({
        success:true,
        promos
      });    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
        success:false,
        datos:error
      }); 
    }
})

app.get('/api/configuraciones/medic-push', async (req, res) => {
  const { id_cli } = req.query;

  if (!id_cli) {
    return res.status(400).json({ error: 'Campo id_cli es requerido' });
  }

  const query = `SELECT mp.id,
                        mp.id_medico,
                        CONCAT(m.nombre, ' ', m.apellido) AS medico
                  FROM medic_push mp 
                  INNER JOIN medicos m ON m.id_medico = mp.id_medico
                  WHERE mp.id_cli = ?`;
 
  try {
    
    const afiliados = await retornar_query(query, [id_cli]);

     if (afiliados) {
      return res.json({
        success: true,
        data: afiliados
      });
    } else {
      return res.json({
        success: false,
        error: afiliados?.error || 'No se pudo enviar la notificación'
      });
    }

  } catch (error) {
registrarErrorPeticion(req, error)    
    return res.status(500).json({ success: false, error });
  }
});

app.post('/api/configuraciones/medic-push', authenticateToken, async (req, res) => {
  const { id_cli, id_med } = req.body;

  if (!id_cli || !id_med) {
    return res.status(400).json({ error: 'Campo clinica y medico es requerido' });
  }
  let cantidad_afiliados_max =0;
  let cantidad_actual =0;
  try {
    let opciones = contenedor_query[3][4]
    const result = await retornar_query( opciones, [id_cli])
    cantidad_afiliados_max = result[0].cantidad_afiliados;    
    
    let cantidad_registros_query = `SELECT count(mp.id) as cantidad
                  FROM medic_push mp                   
                  WHERE mp.id_cli = ?`
    const result_cantidad = await retornar_query( cantidad_registros_query, [id_cli])
    cantidad_actual = result_cantidad[0].cantidad;
    if(cantidad_actual>=cantidad_afiliados_max){
      return res.json({
        success: false,
        error: "La cantidad de usuarios afiliados llego al maximo",
        cantidad_actual,
        cantidad_afiliados_max
      });
    }
  } catch (error) {
registrarErrorPeticion(req, error)
    
  }  

  const query = `INSERT INTO medic_push (id_cli, id_medico) VALUES (?, ?)`;
 
  try {
    
    const insertar = await retornar_query(query, [id_cli, id_med]);

     if (insertar && !insertar?.code) {
      return res.json({
        success: true,
        data: insertar
      });
    } else {
      if (insertar?.code=="ER_DUP_ENTRY"){
        return res.json({
        success: false,
        error: "Ya existe el especialista"
      });
      }
      return res.json({
        success: false,
        error: insertar?.error || 'No se pudo enviar la notificación'
      });
    }

  } catch (error) {
registrarErrorPeticion(req, error)    
    return res.status(500).json({ success: false, error });
  }
});

app.delete('/api/configuraciones/medic-push', authenticateToken, async (req, res) => {
  const { id_afiliado } = req.query;

  if (!id_afiliado) {
    return res.status(400).json({ error: 'Campo id_afiliado es requerido' });
  }

  const query = `DELETE FROM medic_push WHERE id = ?`;
 
  try {
    
    const result = await retornar_query(query, [id_afiliado]);

     if (result && result.affectedRows > 0) {
      return res.json({
        success: true,
        data: result
      });
    } else {
      return res.json({
        success: false,
        error: 'No se encontró el registro para eliminar o no se pudo eliminar.'
      });
    }
  } catch (error) {
registrarErrorPeticion(req, error)    
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/portal-med/cargar-plantilla', async (req, res) => {
  const { tipo, id } = req.query;

  if (!id || !tipo) {
    return res.status(400).json({ error: 'Campo requerido' });
  }

  let query = ``;

  switch (Number(tipo)) {
    case 1:
      query = `SELECT * FROM consultas
              WHERE
                  id_consulta = ?`;
      break;
    case 2:
      query = `SELECT 
                plan_tto, 
                recomendaciones, 
                medicamentos, 
                indicaciones, 
                informe_manual, 
                motivo
            FROM
                consultas
            WHERE
                id_consulta =?`;
      break;  
    default:
      break;
  }

  try {
    const informe = await retornar_query(query, [id]);

      if (!informe || informe.error) {
        return res.json({ success: false, error: 'No existe la plantilla' });
      }
      return res.json({
        success: true,
        data: informe[0]         
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.get('/api/portal-med/cargar-formatos', async (req, res) => {
  const { id_cli } = req.query;

  if (!id_cli ) {
    return res.status(400).json({ error: 'Campo requerido' });
  }

  let query = `SELECT * FROM consultas_formatos
              WHERE
                  id_cli IN (?, 0)`;

  try {
    const formatos = await retornar_query(query, [id_cli]);

      if (!formatos || formatos.error) {
        return res.json({ success: false, error: 'No existe formatos' });
      }
      return res.json({
        success: true,
        data: formatos         
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.get('/api/odonto/opciones-predeterminadas', async (req, res) => {
  const { id_cli } = req.query;

  if (!id_cli  ) {
    return res.status(400).json({ error: 'Campo requerido' });
  }

  let query = ``;


      query = `SELECT id, descripcion as nombre
      FROM odontol_faces
        WHERE
            id_cli IN (?, 0)`;

    let query2 = `SELECT id, descripcion as nombre
        FROM odontol_procedures
          WHERE
              id_cli IN (?, 0)`;
    let query_tipo_cara = `SELECT 
        ptf.id_type,
        f.id AS face_id,
        f.descripcion AS face_name
      FROM 
        odontol_piece_type_faces ptf
        INNER JOIN odontol_faces f ON ptf.id_face = f.id
      ORDER BY 
        ptf.id_type, f.id;`;
      let query_piezas = `SELECT * FROM odontol_pieces`

  try {
    const caras = await retornar_query(query, [id_cli]);
    const procedimientos = await retornar_query(query2, [id_cli]);
    const caras_tipos = await retornar_query(query_tipo_cara, [id_cli]);
    const piezas = await retornar_query(query_piezas, [id_cli]);

      return res.json({
        success: true,
        faces: caras,
        procedures: procedimientos,
        caras_tipos,
        piezas         
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.post('/api/odonto/procedures', async (req, res) => {
  const result = await registrarOdontolProcedure(req.body);
  
  if (result.error ){
    return res.json({error: JSON.parse(result.error.message)})
  }

  const filtros = { ...result.data }
    
  let query = `INSERT INTO 
                odontol_pieces_procedures(
                  piece, 
                  id_procedure, 
                  estado, 
                  id_evaluador, 
                  id_realizado, 
                  nota, 
                  id_admidet, 
                  fecha,
                  id_paciente) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    const insertar = await retornar_query(query, [filtros.pieza, filtros.procedimiento, filtros.estado, filtros.evaluador, filtros.realizador, filtros.notas, filtros.id_admision, filtros.fecha,  filtros.id_paciente]);
    let  result_caras = 0;
    if(!isNaN(insertar.insertId)){
      query = `INSERT INTO 
                odontol_pieces_procedures_faces(
                  id_od_pieces_procedures, 
                  id_faces) 
            VALUES (?, ?)`;
      for (const idCara of filtros.caras) {     
          await retornar_query(query, [insertar.insertId, parseInt(idCara)]);          
          result_caras++;
      }      
    }
      return res.json({
        success: true,
        result: insertar.insertId,
        caras: `Caras afectadas: ${result_caras}`
               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.put('/api/odonto/procedures', async (req, res) => {
  const result = await actualizarOdontolProcedure(req.body);
  
  if (result.error ){
    return res.json({error: JSON.parse(result.error.message)})
  }

  const filtros = { ...result.data }
    
  let query = `UPDATE 
                odontol_pieces_procedures
              SET 
                piece=?, 
                id_procedure=?, 
                estado=?, 
                id_evaluador=?, 
                id_realizado=?, 
                nota=?, 
                fecha=? 
              WHERE 
                id = ?`;
                
        if(isNaN(filtros.id)){
          return res.json({
            success: false,
            error: "Error al obtener la id del procedimiento",        
          });
        }
  try {
    
    const actualizar = await retornar_query(query, [filtros.pieza, filtros.procedimiento, filtros.estado, filtros.evaluador, filtros.realizador, filtros.notas,  filtros.fecha, filtros.id]);
    let  result_caras = 0;
    let eliminacion = "";
    if(actualizar.affectedRows>0){
      query = `DELETE FROM 
                odontol_pieces_procedures_faces
              WHERE 
                id_od_pieces_procedures = ?`;
     eliminacion = await retornar_query(query, [filtros.id]);
      
     if(eliminacion.affectedRows>0){
       query = `INSERT INTO 
                odontol_pieces_procedures_faces(
                  id_od_pieces_procedures, 
                  id_faces) 
            VALUES (?, ?)`;
      for (const idCara of filtros.caras) {     
          await retornar_query(query, [filtros.id, parseInt(idCara)]);          
          result_caras++;
      }    
     } 
       
    }else{
      return res.json({
        success: false,
        error: "Error al actualizar el procedimiento",        
      });
    }
      return res.json({
        success: true,
        result: filtros.id,
        caras_elim: eliminacion,
        caras: `Caras afectadas: ${result_caras}`
               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.patch('/api/odonto/procedures-estado', async (req, res) => {
  const {id, estado, id_realizado} = req.query
  
  if (!id || !estado ){
    return res.json({error: "Faltan datos"})
  }
    
  let query = `INSERT INTO 
                odontol_pieces_procedures
                (piece, id_procedure, estado, id_evaluador, id_realizado, nota, id_admidet, id_paciente, fecha)              
                SELECT piece, id_procedure, ?, id_evaluador, ?, nota, id_admidet, id_paciente, DATE(NOW())
                FROM odontol_pieces_procedures
              WHERE 
                id = ?`;
            
  try {
    
    const actualizar = await retornar_query(query, [estado, id_realizado,id ]);
    if(!isNaN(actualizar.insertId)){
      query = `INSERT INTO 
                odontol_pieces_procedures_faces(
                  id_od_pieces_procedures, 
                  id_faces) 
                  SELECT ?, id_faces
                FROM odontol_pieces_procedures_faces
              WHERE 
                id_od_pieces_procedures = ?`;
    }
    let caras = await retornar_query(query, [actualizar.insertId, id ]);
   
      return res.json({
        success: true,
        result: actualizar,               
        caras
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.get('/api/odonto/procedures', async (req, res) => {
  const {id_admision, fecha = new Date().toISOString().slice(0, 10)} = req.query
  
  if (!id_admision ){
    return res.json({error: "Faltan datos"})
  }
    
  let query = `SELECT
                a.fecha_admision,
                a.tipo_consulta,
                a.id_admision,
                a.diagnostico,
                ad.fecha_detalle,
                ad.id_admidet,
                ad.precio,
                ad.precio_usd,
                ad.cantidad,
                p.id_paciente,
                CONCAT(p.nombres, ' ',p.apellidos) as paciente,
                p.fecha_nacimiento,
                CONCAT(p.tipo_cedula, '-', p.cedula) as cedula,
                e.descripcion as estudio,
                e.id_estudio,
                seguros.descripcion AS seguro,
                empresas.descripcion AS empresa,
                tipos_interno.descripcion AS interno                
              FROM
                admisiones a
              INNER JOIN 
                admisiones_det ad ON ad.id_admision = a.id_admision
              INNER JOIN 
                pacientes p ON a.id_paciente = p.id_paciente
              INNER JOIN 
                estudios e ON ad.id_estudio = e.id_estudio             
              LEFT JOIN 
                  seguros ON a.id_seguro = seguros.id_seguro
              LEFT JOIN 
                  empresas ON a.id_empresa = empresas.id_empresa
              LEFT JOIN 
                  tipos_interno ON a.id_tipo_interno = tipos_interno.id_tipo_interno
              WHERE
                ad.id_admidet = ?`;
  let query2 = `
    SELECT 
      opp.id, 
      opp.piece, 
      opp.id_procedure, 
      MAX(opp.estado) as estado, 
      opp.id_evaluador, 
      opp.id_realizado, 
      opp.nota, 
      opp.id_admidet, 
      opp.id_paciente, 
      MAX(opp.fecha) as fecha, 
      CONCAT('[', GROUP_CONCAT(DISTINCT oppf.id_faces ORDER BY oppf.id_faces SEPARATOR ','), ']') AS caras 
    FROM 
      odontol_pieces_procedures opp 
    INNER JOIN odontol_pieces_procedures_faces oppf ON opp.id = oppf.id_od_pieces_procedures 
    WHERE opp.id_paciente = ? and opp.fecha <= DATE(?) 
    GROUP BY opp.piece, opp.id_procedure
    ORDER BY opp.fecha DESC;`            
  try {
    
    const paciente_consulta = await retornar_query(query, [id_admision]);
    if(paciente_consulta.length>0){
      const paciente_procedimientos = await retornar_query(query2, [paciente_consulta[0].id_paciente, fecha]);
      return res.json({
        success: true,
        result: paciente_consulta,   
        procedures:  paciente_procedimientos           
      }); 
    }
      return res.json({
        success: true,
        result: paciente_consulta,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.delete('/api/odonto/procedures', async (req, res) => {
  const {id_odonto_procedure} = req.query
  
  if (!id_odonto_procedure ){
    return res.json({error: "Faltan datos"})
  }
    
  let query = `
    DELETE FROM 
      odontol_pieces_procedures  
    WHERE id = ? ;`            
  try {
    
    const odontol_pieces_procedures = await retornar_query(query, [id_odonto_procedure]);
    
      return res.json({
        success: true,
        result: odontol_pieces_procedures,   
    
      }); 
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.get('/api/odonto/especialistas', async (req, res) => {
  const {id_cli} = req.query
  
  if (!id_cli ){
    return res.json({error: "Faltan datos"})
  }
    
  let query = `SELECT
                m.id_medico,
                CONCAT(m.nombre, ' ', m.apellido) AS especialista,
                e.descripcion AS especialidad, 
                mc.id_cli
              FROM
                medicos m
              INNER JOIN
                med_esp me ON m.id_medico = me.id_medico
              INNER JOIN
                especialidades e ON e.id_especialidad = me.id_especialidad   
              INNER JOIN
                medicos_clinicas mc ON mc.id_med = m.id_medico
              WHERE
                LOWER(e.descripcion) LIKE '%odon%'
                AND mc.id_cli = ?;`;
  try {
    
    const especialistas = await retornar_query(query, [id_cli]);
    if(especialistas.error){
     
      return res.json({
        success: false,
        error: "No existen especialistas del area"
      }); 
    }
      return res.json({
        success: true,
        result: especialistas,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
});

app.get('/api/caja/estado', async (req, res)=>{
const {id_cli, fecha} = req.query
  
  if (!id_cli ){
    return res.json({error: "Faltan datos"})
  }
   
  let query = `
  SELECT estado     
      FROM 
        caja_apertura_cierre
      WHERE
        id_cli =? AND
        fecha = ? `  
  try {
    
    const estado = await retornar_query(query, [id_cli,fecha]);
    if(estado.error){
      return res.json({
        success: true,
        estado: "Cerrado"
        
      }); 
    }
    let status = (estado[0].estado==1)?"Abierto":"Cerrado"
    
    return res.json({
        success: true,
        estado: status,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
} ) 

app.post('/api/caja/apertura', async (req, res)=>{
const {id_cli, fecha, id_usu,  detalles} = req.body
  
  if (!id_cli || isNaN(id_cli) || !fecha || !id_usu || isNaN(id_usu) || !Array.isArray(detalles) || detalles.length === 0 ){
    return res.json({error: "Faltan datos"})
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'El formato de la fecha debe ser YYYY-MM-DD.' });
  }
  
  if (!Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({ error: 'El campo detalles debe ser un array de objetos no vacío.' });
  }

  for (const detalle of detalles) {
    if (typeof detalle !== 'object' || detalle === null) {
      return res.status(400).json({ error: 'Cada elemento en detalles debe ser un objeto.' });
    }
    if (!('id_formato' in detalle) || isNaN(detalle.id_formato)) {
      return res.status(400).json({ error: 'Cada detalle debe tener un id_formato numérico.' });
    }
    if (!('monto' in detalle) || isNaN(detalle.monto)) {
      return res.status(400).json({ error: 'Cada detalle debe tener un monto numérico.' });
    }
    if (!('id_moneda' in detalle) || isNaN(detalle.id_moneda)) {
      return res.status(400).json({ error: 'Cada detalle debe tener un id_moneda numérico.' });
    }
  }

  let query_insert_apertura = `
    INSERT INTO caja_apertura_cierre (id_cli, fecha, id_usuario, estado)
    VALUES (?, ?, ?, 1)
  `;

  let query_insert_detalles = `
    INSERT INTO caja_apertura_cierre_det (id_apertura_cierre, id_formato, monto, id_moneda, id_usuario)
    VALUES (?, ?, ?, ?,?)
  `;

  try {
    const result_apertura = await retornar_query(query_insert_apertura, [id_cli, fecha, id_usu]);

    if (result_apertura.error || !result_apertura.insertId) {
      if(result_apertura.message.startsWith("Duplicate entry")){
         return res.json({
        success: false,
        error: 'La caja ya esta abierta en esta fecha.',
        details: result_apertura
      });
      }
      return res.json({
        success: false,
        error: 'Error al registrar la apertura de caja.',
        details: result_apertura
      });
    }

    const id_apertura_cierre = result_apertura.insertId;
    const insert_detalles_promises = detalles.map(detalle =>
      retornar_query(query_insert_detalles, [id_apertura_cierre, detalle.id_formato, detalle.monto, detalle.id_moneda, id_usu])
    );

    await Promise.all(insert_detalles_promises);

    return res.json({
      success: true,
      message: 'Apertura de caja registrada exitosamente.',
      id_apertura_cierre: id_apertura_cierre
    });

  } catch (error) {
registrarErrorPeticion(req, error)
    
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar la solicitud.',
      details: error.message
    });
  }
});

app.get('/api/caja/cierre', async (req, res)=>{
const {id_cli, fecha} = req.query

  if (!id_cli || !fecha ){
    return res.json({error: "Faltan datos"})
  }

  let query = `SELECT cp.id_moneda, 
    CASE 
      WHEN cp.id_moneda = 1 THEN 'USD' 
      WHEN cp.id_moneda = 2 THEN 'Bs' 
      ELSE 'Otra' END AS moneda_descripcion, 
    fp.id_forma_pago, 
    fp.descripcion AS forma_pago_descripcion, 
    COUNT(cp.id_control_pago) AS cantidad_pagos, 
    SUM(cp.monto) AS total_moneda_original, 
    SUM(CASE WHEN cp.id_moneda = 1 THEN cp.monto_bs ELSE cp.monto END) AS total_bs_equivalente 
  FROM control_pagos cp 
  INNER JOIN 
    formas_pago fp ON cp.id_forma_pago = fp.id_forma_pago 
      AND fp.activo = 1 WHERE cp.id_cli = ? 
      AND DATE(cp.fecha_creacion) = ? 
      AND cp.activo = 1 
    GROUP BY cp.id_moneda, fp.id_forma_pago, fp.descripcion 
  ORDER BY cp.id_moneda, fp.id_forma_pago;`;

  try {
    let cierre = await retornar_query(query, [id_cli, fecha]);
    if(cierre.error){
      cierre = [{
                    "id_moneda": 2,
                    "moneda_descripcion": "Bs",
                    "id_forma_pago": 3,
                    "forma_pago_descripcion": "Pago Movil",
                    "cantidad_pagos": 0,
                    "total_moneda_original": "0.00",
                    "total_bs_equivalente": "0.00"
                }]
    }
    
    query=`SELECT 
    cad.id_moneda,
    CASE 
        WHEN cad.id_moneda = 1 THEN 'USD'
        WHEN cad.id_moneda = 2 THEN 'Bs'
        ELSE 'Otra'
    END AS moneda_descripcion,
    cad.id_formato,
    fp.descripcion AS forma_pago_descripcion,
    COUNT(cad.id) AS cantidad_registros,
    SUM(cad.monto) AS total_moneda_original
FROM 
    caja_apertura_cierre cac
INNER JOIN 
    caja_apertura_cierre_det cad ON cac.id = cad.id_apertura_cierre
LEFT JOIN
    formas_pago fp ON cad.id_formato = fp.id_forma_pago
WHERE 
    cac.id_cli = ?
    AND DATE(cac.fecha) = ?
GROUP BY 
    cad.id_moneda, cad.id_formato, fp.descripcion
ORDER BY 
    cad.id_moneda, cad.id_formato;`;
    
    let movimientos_apertura = await retornar_query(query, [id_cli, fecha]);

    if(movimientos_apertura.error){
      return res.json({
        success: false,
        error: "No existen apertura en el dia"
      });
    }
    


    return res.json({
      success: true,
      movimientos_dia: cierre,
      movimientos_apertura: movimientos_apertura,               
    });      
    

  } catch (error) {
registrarErrorPeticion(req, error)
    
  }

})

app.post('/api/caja/cierre', async (req, res)=>{
const {id_cli, id_usu, fecha} = req.body
  
  if (!id_cli || isNaN(id_cli) || !id_usu || isNaN(id_usu) ){
    return res.json({error: "Faltan datos"})
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'El formato de la fecha debe ser YYYY-MM-DD.' });
  }


  let query_cerrar_q = `
    UPDATE caja_apertura_cierre SET estado = 0, id_usuario_cierra=?
    WHERE id_cli=? AND
    fecha=?  
  `;

  try {
    const query_cerrar = await retornar_query(query_cerrar_q, [id_usu, id_cli, fecha]);

    if (query_cerrar.error ) {           
      return res.json({
        success: false,
        error: 'Error al registrar el cierre de caja.',
        details: query_cerrar
      });
    }

    return res.json({
      success: true,
      message: 'Caja cerrada.',
      query_cerrar
    });

  } catch (error) {
registrarErrorPeticion(req, error)
    
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al procesar la solicitud.',
      details: error.message
    });
  }
});

app.get('/api/pacientes/get_ultima_direccion', async (req, res)=>{
const {paciente} = req.query
  
  if (!paciente ){
    return res.json({error: "Faltan datos"})
  }
    
  let query = `
  SELECT
        a.id_estado,
        e.estado,
        a.id_municipio, 
        m.municipio,
        a.id_parroquia,
        prr.parroquia,
        a.id_zona,
        z.zona,
        a.fecha_admision 
      FROM 
        admisiones a
      INNER JOIN  
        estados e ON e.id_estado = a.id_estado
      INNER JOIN
        pacientes p ON p.id_paciente =a.id_paciente
      INNER JOIN
        municipios m ON m.id_municipio = a.id_municipio
      INNER JOIN 
        parroquias prr ON prr.id_parroquia = a.id_parroquia
      LEFT OUTER JOIN 
        zonas z ON z.id_zona = a.id_zona
      WHERE
        a.id_paciente =? AND
        a.activo =1 
      ORDER BY a.fecha_admision DESC 
      LIMIT 1`  
  try {    
    const direccion = await retornar_query(query, [paciente]);
    if(direccion.error){
     
      return res.json({
        success: false,
        error: "No existen especialistas del area"
      }); 
    }
      return res.json({
        success: true,
        result: direccion,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
} ) 

app.get('/api/empresas-registradas', loginLimiter, async (req, res) => {
let query = `
  SELECT pue.apellidos as clinica, 
        e.estado,
        pue.id
  FROM perfil_usuario_empresa pue
  INNER JOIN estados e ON e.id_estado = pue.id_estado
`
try {
    const empresas = await retornar_query(query, []);
    if(empresas.error){
      return res.json({
        success: false,
        error: "No existen empresas registradas"
      }); 
    }
      return res.json({
        success: true,
        result: empresas,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
} )

app.get('/api/reportes/record_medico', async (req,res)=> {
  const { fechaInicial, fechaFinal, id_cli} = req.query;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicial)) {
    return res.status(400).json({ error: 'El formato de la fecha' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {  
    return res.status(400).json({ error: 'El formato de la fecha' });
  }
  if(isNaN(id_cli)){  
    return res.status(400).json({ error: 'El id es necesario' });
  }


  let query = `
  SELECT 
    ad.id_medico, 
    CONCAT(m.nombre, ' ', m.apellido) AS medico, 
    e.descripcion as procedimiento,
    SUM(ad.cantidad) as cantidad_total,
    SUM(ad.precio * ad.cantidad) as monto_total_bs,
    SUM(ad.precio_usd * ad.cantidad) as monto_total_usd,
    COUNT(ad.id_admidet) as total_registros
FROM admisiones_det ad
INNER JOIN admisiones a ON a.id_admision = ad.id_admision
INNER JOIN estudios e ON e.id_estudio = ad.id_estudio
INNER JOIN medicos m ON m.id_medico = ad.id_medico
WHERE a.id_cli = ?
    AND ad.activo = 1 
    AND a.activo = 1 
    AND a.fecha_admision BETWEEN ? and CONCAT(?, ' 23:59:59') 
GROUP BY 
    ad.id_medico, 
    e.id_estudio,  
    e.descripcion,
    m.nombre,
    m.apellido
ORDER BY 
    medico, 
    procedimiento;`;    
  
 try {
    const respuesta = await retornar_query(query, [id_cli, fechaInicial, fechaFinal]);         
    
      return res.json({
        success:true,
        data:respuesta
      });    
    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
        success:false,
        error:error
      }); 
    }
})

app.get('/api/news/:id_cli', async (req,res)=> {
  const { id_cli } = req.params;
  const { page=1, perPage=10 } = req.query;

  const offset = (page - 1) * perPage;

  if(isNaN(id_cli)){  
    return res.status(400).json({ error: 'El id es necesario' });
  }


  let query = `
  SELECT 
   *
  FROM versiones 
  WHERE id_cli IN (0,?)
  ORDER BY 
      id_version DESC
   LIMIT ? OFFSET ?`;    
  
 try {
    const respuesta = await retornarQuery(query, [id_cli, perPage, offset]);         
    
    let query_total = `
      SELECT COUNT(*) AS total
      FROM versiones
      WHERE id_cli IN (0,?)`


      let total = await retornar_query(query_total, [id_cli]);
      
      if(total.error){
        return res.json({ success: false, error: 'Error al obtener el total' + total.error });
      }
      if(Number(total[0].total)===0){
        return res.json({ success: true, data: [], total: 0 });
      }

      const total_news = Number(total[0].total) || 0;
      const totalPages=  Math.ceil(total_news / perPage)


      res.json({ success: true,
                data:respuesta,
                pagination: {
                          page,
                          perPage,
                          totalPages,
                          total_news
                        }});         
    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
        success:false,
        error:error
      }); 
    }
})

app.use((error, req, res, next) => {
  if (req.requestId) {
    registrarErrorPeticion(req, error.message + 'error aqui');
  }
  res.status(500).json({ success: false, error: 'Error interno a',detalles: error });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

//actualizarUUIDs('id_paciente', 'pacientes', 'uuid_paciente');
