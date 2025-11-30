// routes/portal_medico.js
const express = require('express');
const router = express.Router();
const { retornar_query, retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');
const { buildUpdateQuery } = require('../funciones/funciones_comunes_be');

// GET /api/portal_medico
router.get('/listado-pacientes', async (req, res) => {
    const {id_cli, id_med, fechaInicio, fechaFin} = req.query;
    try {
        const query = `
            SELECT 
                a.id_estado_admision,
                a.id_admision, 
                a.fecha_admision,
                a.fecha_creacion,
                ad.id_medico, 
                a.tipo_consulta,
                CASE
                    WHEN a.tipo_consulta = 'S' THEN 'SEGURO'
                    WHEN a.tipo_consulta = 'E' THEN 'EMPRESA'
                    WHEN a.tipo_consulta = 'P' THEN 'PARTICULAR'
                    WHEN a.tipo_consulta = 'I' THEN 'INTERNO'  
                END AS TipoConsulta,
                CONCAT(p.nombres, ' ', p.apellidos) AS paciente, 
                CONCAT(p.tipo_cedula, '-', p.cedula) AS cedula, 
                a.edad,
                MAX(ad.id_admidet) AS id_admidet,
                CASE 
                    WHEN a.turno IS NULL THEN 999
                    ELSE a.turno 
                END AS turno,
                CASE
                    WHEN a.id_estado_admision = 1 THEN 'En espera'
                    WHEN a.id_estado_admision = 2 THEN 'Llamado'
                    WHEN a.id_estado_admision = 3 THEN 'Atendido'
                    WHEN a.id_estado_admision = 4 THEN 'Cancelado'                     
                END AS Estado,
                CASE
                    WHEN a.id_estado_admision = 1 THEN 4
                    WHEN a.id_estado_admision = 2 THEN 7
                    WHEN a.id_estado_admision = 3 THEN 8
                    WHEN a.id_estado_admision = 4 THEN 1                    
                END AS clase_color_code
            FROM
                admisiones a
            INNER JOIN
                admisiones_det ad ON a.id_admision = ad.id_admision
            INNER JOIN
                pacientes p ON a.id_paciente = p.id_paciente
            WHERE
                a.id_estado_admision IN (1,2,3,4) 
                AND ad.id_medico = ?
                AND a.id_cli = ?
                AND a.solo_ppto = 0 
                AND ad.activo = 1 
                AND a.activo = 1     
                AND a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
            GROUP BY 
                a.id_admision, 
                a.id_estado_admision, 
                a.fecha_admision, 
                a.fecha_creacion, 
                ad.id_medico, 
                a.tipo_consulta, 
                p.nombres, 
                p.apellidos, 
                p.tipo_cedula, 
                p.cedula, 
                a.edad, 
                a.turno
            ORDER BY 
                turno, 
                a.id_admision
        `;
        
        const listado = await retornar_query(query,[id_med, id_cli, fechaInicio, fechaFin]);
        
        if (!Array.isArray(listado)) {            
            return res.json({
                success: false,
                error: 'Error interno al procesar los presupuestos.',
                listado
            });
        }
        
        return res.json({
            success: true,
            data: listado
        });
    } catch (error) { registrarErrorPeticion(req, error);       
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el listado',
            details: error
        });
    }
});

router.post('/evoluciones/', authenticateToken, async (req, res) => {

  const {
    id_paciente,
    id_consulta,
    id_med,
    tipo_evolucion,
    motivo,
    estado_paciente,
    hallazgos,
    resultados_estudios,
    plan,
    notas_adicionales,
    signos_vitales 
  } = req.body;

  if (!req.id_cli || isNaN(req.id_cli)) {
    return res.status(400).json({ success: false, error: 'id_cli inválido' });
  }
  const id_cli = req.id_cli
  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente es obligatorio y debe ser numérico' });
  }
  if (!id_med || isNaN(id_med)) {
    return res.status(400).json({ success: false, error: 'id_med es obligatorio y debe ser numérico' });
  }
  if (!tipo_evolucion || isNaN(tipo_evolucion)) {
    return res.status(400).json({ success: false, error: 'tipo_evolucion es obligatorio' });
  }
  const estadosValidos = ['estable', 'mejoria', 'estacionario', 'empeoramiento', 'critico'];
  if (!estadosValidos.includes(estado_paciente)) {
    return res.status(400).json({ success: false, error: 'estado_paciente no válido' });
  }

  if(!id_consulta || isNaN(id_consulta)){
    return res.status(400).json({ success: false, error: 'id_consulta es obligatorio y debe ser numérico' });
  }
  let id_dato_enfermeria = null;

  try {
    
    if (signos_vitales && Object.keys(signos_vitales).length > 0) {
  const {
    pa_sistolica,
    pa_diastolica,
    frec_cardiaca,
    frec_respiratoria,
    temperatura,
    sat_oxigeno,
    peso,
    talla
  } = signos_vitales;

  const queryEnf = `
    INSERT INTO datos_enfermeria (
      id_paciente,  id_usuario, proc_reg,
      pa_sistolica, pa_diastolica,
      frec_cardiaca, frec_respiratoria, temperatura, sat_oxigeno,
      peso, talla,
      fecha_creacion, id_admision
    ) VALUES (?, ?, 'Evolucion', ?, ?, ?, ?, ?, ?, ?, ?, NOW(),
    (select 
      ad.id_admision 
    from admisiones_det ad 
    inner join admisiones a ON a.id_admision=ad.id_admision
    inner join consultas c ON  c.id_admidet=ad.id_admidet
    Where c.id_consulta =?) 
    )
  `;
  const paramsEnf = [
    id_paciente,  id_med,
    pa_sistolica ? parseInt(pa_sistolica, 10) : null,
    pa_diastolica ? parseInt(pa_diastolica, 10) : null,
    frec_cardiaca ? parseInt(frec_cardiaca, 10) : null,
    frec_respiratoria ? parseInt(frec_respiratoria, 10) : null,
    temperatura ? parseFloat(temperatura) : null,
    sat_oxigeno ? parseInt(sat_oxigeno, 10) : null,
    peso ? parseFloat(peso) : null,
    talla ? parseFloat(talla) : null, 
    id_consulta
  ];

  const resultEnf = await retornarQuery(queryEnf, paramsEnf);
  if (resultEnf.error) throw new Error('Error al registrar signos vitales');
  id_dato_enfermeria = resultEnf.data.insertId;
}

    // 2. Insertar evolución
    const queryEvol = `
      INSERT INTO evoluciones (
        id_paciente, id_consulta, id_med, id_cli, id_dato_enfermeria,
        fecha_hora, tipo_evolucion, motivo, estado_paciente,
        hallazgos, resultados_estudios, plan, notas_adicionales,
        firmada
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, FALSE)
    `;

    const paramsEvol = [
      id_paciente,
      id_consulta || null,
      id_med,
      id_cli,
      id_dato_enfermeria,
      tipo_evolucion,
      motivo || null,
      estado_paciente,
      hallazgos || null,
      resultados_estudios || null,
      plan || null,
      notas_adicionales || null
    ];

    const resultEvol = await retornarQuery(queryEvol, paramsEvol);
    if (resultEvol.error) throw new Error(resultEvol.error);

    return res.json({
      success: true,
      datos: { id_evolucion: resultEvol.data.insertId, id_dato_enfermeria }
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/paciente/:id_paciente', authenticateToken, async (req, res) => {
  const { id_paciente } = req.params;

  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente inválido' });
  }

  const query = `
    SELECT 
      e.id_evolucion,
      e.id_paciente,
      e.id_consulta,
      e.id_med,
      e.id_cli,
      e.id_dato_enfermeria,
      e.fecha_hora,
      e.tipo_evolucion,
      e.motivo,
      e.estado_paciente,
      e.hallazgos,
      e.resultados_estudios,
      e.plan,
      e.notas_adicionales,
      e.firmada,
      e.fecha_firma,
      t.nombre AS tipo_evolucion_nombre,
      CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre
    FROM evoluciones e
    LEFT JOIN tipos_evolucion t ON e.tipo_evolucion = t.id_tipo
    LEFT JOIN medicos m ON e.id_med = m.id_med
    WHERE e.id_paciente = ?
    ORDER BY e.fecha_hora DESC
  `;

  try {
    const result = await retornarQuery(query, [id_paciente]);
    if (result.error) throw new Error(result.error);

    return res.json({ success: true, datos: result });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;

  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  const query = `
    SELECT 
      e.*,
      t.nombre AS tipo_evolucion_nombre,
      CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre,
      d.pa_sistolica,
      d.pa_diastolica,
      d.frec_cardiaca,
      d.frec_respiratoria,
      d.temperatura,
      d.sat_oxigeno,
      d.peso,
      d.talla,
      d.fecha_creacion AS fecha_signos,
      CONCAT(p.nombres, ' ', p.apellidos) AS paciente, 
      CONCAT(p.tipo_cedula, p.cedula) AS cedula, 
      p.uuid_paciente
    FROM evoluciones e
    LEFT JOIN tipos_evolucion t ON e.tipo_evolucion = t.id_tipo
    LEFT JOIN medicos m ON e.id_med = m.id_medico
    LEFT JOIN datos_enfermeria d ON e.id_dato_enfermeria = d.id_datos_enfermeria
    inner join pacientes p ON e.id_paciente=p.id_paciente
    WHERE e.id_evolucion = ?
  `;

  try {
    const result = await retornarQuery(query, [id_evolucion]);
    if (result.error) throw new Error(result.error);
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
    }

    return res.json({ success: true, datos: result.data[0]  });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/evoluciones/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  const { signos_vitales, ...updateFields } = req.body;

  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }
  const id_cli = req.id_cli
  // 1. Verificar que la evolución existe y no está firmada
  const checkQuery = `SELECT firmada, id_paciente, id_cli, id_med FROM evoluciones WHERE id_evolucion = ?`;
  const checkResult = await retornarQuery(checkQuery, [id_evolucion]);
  if (checkResult.data.length === 0) {
    return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
  }
  if (checkResult.data[0].firmada) {
    return res.status(400).json({ success: false, error: 'No se puede editar una evolución ya firmada' });
  }

  const { id_paciente,  id_med } = checkResult.data[0];
  let id_dato_enfermeria = null;

  try {
    // 2. Si hay nuevos signos_vitales, crear nuevo registro (reemplazar enlace)
   if (signos_vitales && Object.keys(signos_vitales).length > 0) {
  const {
    pa_sistolica,
    pa_diastolica,
    frec_cardiaca,
    frec_respiratoria,
    temperatura,
    sat_oxigeno,
    peso,
    talla
  } = signos_vitales;

  const queryEnf = `
    INSERT INTO datos_enfermeria (
      id_paciente, id_usuario, proc_reg,
      pa_sistolica, pa_diastolica,
      frec_cardiaca, frec_respiratoria, temperatura, sat_oxigeno,
      peso, talla,
      fecha_creacion, id_admision
    ) VALUES (?, ?,  'Evolucion', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), (select 
      ad.id_admision 
    from admisiones_det ad 
    inner join admisiones a ON a.id_admision=ad.id_admision
    inner join consultas c ON  c.id_admidet=ad.id_admidet
    Where c.id_consulta =?))
  `;
  const paramsEnf = [
    id_paciente, id_med,
    pa_sistolica ? parseInt(pa_sistolica, 10) : null,
    pa_diastolica ? parseInt(pa_diastolica, 10) : null,
    frec_cardiaca ? parseInt(frec_cardiaca, 10) : null,
    frec_respiratoria ? parseInt(frec_respiratoria, 10) : null,
    temperatura ? parseFloat(temperatura) : null,
    sat_oxigeno ? parseInt(sat_oxigeno, 10) : null,
    peso ? parseFloat(peso) : null,
    talla ? parseFloat(talla) : null,
    updateFields.id_consulta
  ];

  const resultEnf = await retornarQuery(queryEnf, paramsEnf);
  id_dato_enfermeria = resultEnf.data.insertId;
}

    // 3. Campos permitidos para actualizar
    const allowed = [
      'id_consulta', 'tipo_evolucion', 'motivo', 'estado_paciente',
      'hallazgos', 'resultados_estudios', 'plan', 'notas_adicionales'
    ];

    // Validar estado_paciente si viene
    if (updateFields.estado_paciente) {
      const estadosValidos = ['estable', 'mejoria', 'estacionario', 'empeoramiento', 'critico'];
      if (!estadosValidos.includes(updateFields.estado_paciente)) {
        return res.status(400).json({ success: false, error: 'estado_paciente no válido' });
      }
    }

    const whereConditions = { id_evolucion: parseInt(id_evolucion, 10) };
    let updateQueryObj = buildUpdateQuery('evoluciones', allowed, updateFields, whereConditions);

    if (id_dato_enfermeria !== null) {
      // Si creamos nuevo dato de enfermería, forzamos su inclusión
      if (!updateQueryObj) {
        updateQueryObj = {
          query: `UPDATE evoluciones SET id_dato_enfermeria = ? WHERE id_evolucion = ?`,
          values: [id_dato_enfermeria, id_evolucion]
        };
      } else {
        // Añadir id_dato_enfermeria al query existente
        const idx = updateQueryObj.query.lastIndexOf('WHERE');
        updateQueryObj.query = updateQueryObj.query.slice(0, idx) + ', id_dato_enfermeria = ? ' + updateQueryObj.query.slice(idx);
        updateQueryObj.values.splice(-1, 0, id_dato_enfermeria);
      }
    }

    if (!updateQueryObj) {
      return res.json({ success: false, error: 'No hay campos para actualizar' });
    }

    const result = await retornarQuery(updateQueryObj.query, updateQueryObj.values);
    return res.json({ success: true, datos: result });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/evoluciones/:id_evolucion/firmar', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;

  // Validar que el ID sea numérico
  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  // Suponemos que authenticateToken inyecta req.user con el id del usuario autenticado
  let id_usuario_firma = req.logData.id_usuario; 
  if (!id_usuario_firma) {
    return res.status(401).json({ success: false, error: 'Usuario no autenticado o sin ID' });
  }

  try {
    // 1. Verificar estado actual de la evolución
    const checkQuery = `
      SELECT 
        firmada, 
        id_med 
      FROM evoluciones 
      WHERE id_evolucion = ?
    `;
    const checkResult = await retornarQuery(checkQuery, [id_evolucion]);

    if (checkResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
    }

    const evol = checkResult.data[0];
    if (evol.firmada) {
      return res.status(400).json({ success: false, error: 'La evolución ya está firmada' });
    }


    // solo el médico que la creó pueda firmar:
    try{
      let queryUsuario = "SELECT id_especialista FROM perfil_usuario_basico WHERE id_usuario=?"
      let idMedUsu = await retornarQuery(queryUsuario,[id_usuario_firma])
      id_usuario_firma=idMedUsu.data[0].id_especialista
    }catch{
      return res.status(403).json({ success: false, error: 'Usuario no es especialista' });
    }
   
    if (evol.id_med !== id_usuario_firma) {
      return res.status(403).json({ success: false, error: 'Solo el médico asignado puede firmar esta evolución', firmas:{evol:evol.id_med, id_usuario_firma} });
    }
  
    // 2. Actualizar como firmada
    const updateQuery = `
      UPDATE evoluciones 
      SET 
        firmada = TRUE,
        fecha_firma = NOW(),
        id_usuario_firma = ?
      WHERE id_evolucion = ?
    `;

    const result = await retornarQuery(updateQuery, [id_usuario_firma, id_evolucion]);
    if (result.error) throw new Error('Error al firmar la evolución');

    return res.json({
      success: true,
      mensaje: 'Evolución firmada correctamente',
      datos: {
        id_evolucion: parseInt(id_evolucion, 10),
        fecha_firma: new Date().toISOString()
      }
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message, firmas:{evol:evol.id_med, id_usuario_firma} });
  }
});

router.get('/dashboard/paciente/:id_paciente/signos-vitales', authenticateToken, async (req, res) => {
  const { id_paciente } = req.params;
  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente inválido' });
  }

  const query = `
    SELECT 
      de.id_datos_enfermeria,
      de.pa_sistolica,
      de.pa_diastolica,
      de.frec_cardiaca,
      de.frec_respiratoria,
      de.temperatura,
      de.sat_oxigeno,
      de.peso,
      de.talla,
      de.fecha_creacion,
      de.proc_reg,
      de.id_usuario
    FROM datos_enfermeria de
    inner join admisiones a on a.id_admision = de.id_admision
    WHERE de.id_paciente = ? and a.id_cli =?
    ORDER BY fecha_creacion ASC
  `;

  try {
    const result = await retornarQuery(query, [id_paciente, req.id_cli]);
    return res.json({ success: true, datos: result });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/paciente/:id_paciente/timeline', authenticateToken, async (req, res) => {
  const { id_paciente } = req.params;
  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente inválido' });
  }

  const query = `
    (
      SELECT 
        'consulta' AS tipo, 
        c.id_consulta AS id_registro, 
        NULL AS id_evolucion, 
        c.id_consulta, 
        NULL AS id_med_evolution, 
        c.fecha_creacion as fecha_hora, 
        c.motivo AS titulo, 
        NULL AS estado_paciente, 
        NULL AS firmada ,
        c.id_admidet,
        a.id_admision,
        a.id_cli
    FROM consultas c 
    INNER JOIN admisiones_det ad on ad.id_admidet = c.id_admidet 
    INNER join admisiones a on a.id_admision = ad.id_admision 
    WHERE a.id_paciente = ? AND a.id_cli =?
    )
    UNION ALL
    (
      SELECT 
        'evolucion' AS tipo,
        id_evolucion AS id_registro,
        id_evolucion,
        id_consulta,
        id_med AS id_med_evolution,
        fecha_hora,
        CONCAT('Evolución ', te.nombre) AS titulo,
        estado_paciente,
        firmada,
        NULL as id_admidet,
        NULL as id_admision,
        id_cli
      FROM evoluciones e
      LEFT JOIN tipos_evolucion te ON e.tipo_evolucion = te.id_tipo
      WHERE e.id_paciente = ? AND e.id_cli =?
    )
    ORDER BY fecha_hora DESC
  `;

  let queryPaciente = `
  select * from pacientes where id_paciente = ?
  `

  try {
    const result = await retornarQuery(query, [id_paciente, req.id_cli, id_paciente, req.id_cli]);
    const paciente =  await retornarQuery(queryPaciente, [id_paciente]);
    return res.json({ success: true, datos: result, paciente });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/catalogos/tipos-evolucion', authenticateToken, async (req, res) => {
  const query = `
    SELECT id_tipo, nombre
    FROM tipos_evolucion
    WHERE activo = 1
    ORDER BY nombre
  `;

  try {
    const result = await retornarQuery(query, []);
    return res.json({ success: true, datos: result });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/recetas/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  const {
    id_consulta,         
    nombre_medicamento,
    dosis,
    via_administracion,
    frecuencia,
    duracion,
    indicaciones
  } = req.body;

  // Validar id_evolucion
  if (id_evolucion === undefined || id_evolucion === null || (id_evolucion !== '0' && isNaN(id_evolucion))) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  const required = ['nombre_medicamento', 'dosis', 'via_administracion', 'frecuencia', 'duracion'];
  for (const field of required) {
    if (!req.body[field] || req.body[field].toString().trim() === '') {
      return res.status(400).json({ success: false, error: `El campo ${field} es obligatorio` });
    }
  }

  try {
    let evolId, id_paciente, id_med, id_cli;
 let consultaResult, evolResult;
    if (id_evolucion === '0') {
      // === Crear evolución automática ===
      if (!id_consulta || isNaN(id_consulta)) {
        return res.status(400).json({ success: false, error: 'id_consulta es obligatorio cuando id_evolucion = 0' });
      }

      consultaResult = await retornarQuery(
        `SELECT a.id_paciente, ad.id_medico, a.id_cli FROM consultas c
        inner join admisiones_det ad on ad.id_admidet = c.id_admidet
        inner join admisiones a on a.id_admision = ad.id_admision
        WHERE id_consulta = ?`,
        [id_consulta]
      );
      if (consultaResult.data?.length === 0) {
        return res.status(400).json({ success: false, error: 'Consulta no encontrada' });
      }
      const { id_paciente: c_pac, id_medico: c_med, id_cli: c_cli } = consultaResult.data[0];

      evolResult = await retornarQuery(
        `INSERT INTO evoluciones (
          id_paciente, id_consulta, id_med, id_cli,
          tipo_evolucion, estado_paciente, motivo, firmada, fecha_hora
        ) VALUES (?, ?, ?, ?, 8, 'estable', 'Generada desde receta', FALSE, NOW())`,
        [c_pac, id_consulta, c_med, c_cli]
      );

      evolId = evolResult.data.insertId;
      id_paciente = c_pac;
      id_med = c_med;
      id_cli = c_cli;

    } else {
      // === Usar evolución existente ===
      evolResult = await retornarQuery(
        `SELECT id_paciente, id_med, id_cli FROM evoluciones WHERE id_evolucion = ? AND firmada = FALSE`,
        [id_evolucion]
      );
      if (evolResult.data.length === 0) {
        return res.status(400).json({ success: false, error: 'Evolución no encontrada o ya firmada' });
      }
      const { id_paciente: e_pac, id_med: e_med, id_cli: e_cli } = evolResult.data[0];
      evolId = id_evolucion;
      id_paciente = e_pac;
      id_med = e_med;
      id_cli = e_cli;
    }

    // Crear receta
    const result = await retornarQuery(
      `INSERT INTO recetas (
        id_evolucion, id_paciente, id_med, id_cli,
        nombre_medicamento, dosis, via_administracion, frecuencia, duracion, indicaciones,
        fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        evolId, id_paciente, id_med, id_cli,
        nombre_medicamento.trim(),
        dosis.trim(),
        via_administracion.trim(),
        frecuencia.trim(),
        duracion.trim(),
        indicaciones ? indicaciones.trim() : null
      ]
    );

    return res.json({ success: true, datos: { id_receta: result.data.insertId, id_evolucion: evolId },consultaResult, evolResult, result });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tratamientos/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  const {
    id_consulta,         
    descripcion,
    tipo_tratamiento
  } = req.body;

  if (id_evolucion === undefined || id_evolucion === null || (id_evolucion !== '0' && isNaN(id_evolucion))) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  if (!descripcion || descripcion.trim() === '') {
    return res.status(400).json({ success: false, error: 'La descripción es obligatoria' });
  }
  if (!tipo_tratamiento || tipo_tratamiento.trim() === '') {
    return res.status(400).json({ success: false, error: 'El tipo de tratamiento es obligatorio' });
  }

  try {
    let evolId, id_paciente, id_med, id_cli;

    if (id_evolucion === '0') {
      // === Crear evolución automática ===
      if (!id_consulta || isNaN(id_consulta)) {
        return res.status(400).json({ success: false, error: 'id_consulta es obligatorio cuando id_evolucion = 0' });
      }

      const consultaResult = await retornarQuery(
        `SELECT id_paciente, id_med, id_cli FROM consultas WHERE id_consulta = ?`,
        [id_consulta]
      );
      if (consultaResult.data.length === 0) {
        return res.status(400).json({ success: false, error: 'Consulta no encontrada' });
      }
      const { id_paciente: c_pac, id_med: c_med, id_cli: c_cli } = consultaResult.data[0];

      const evolResult = await retornarQuery(
        `INSERT INTO evoluciones (
          id_paciente, id_consulta, id_med, id_cli,
          tipo_evolucion, estado_paciente, motivo, firmada, fecha_hora
        ) VALUES (?, ?, ?, ?, 8, 'estable', 'Generada desde tratamiento', FALSE, NOW())`,
        [c_pac, id_consulta, c_med, c_cli]
      );

      evolId = evolResult.data.insertId;
      id_paciente = c_pac;
      id_med = c_med;
      id_cli = c_cli;

    } else {
      // === Usar evolución existente ===
      const evolResult = await retornarQuery(
        `SELECT id_paciente, id_med, id_cli FROM evoluciones WHERE id_evolucion = ? AND firmada = FALSE`,
        [id_evolucion]
      );
      if (evolResult.data.length === 0) {
        return res.status(400).json({ success: false, error: 'Evolución no encontrada o ya firmada' });
      }
      const { id_paciente: e_pac, id_med: e_med, id_cli: e_cli } = evolResult.data[0];
      evolId = id_evolucion;
      id_paciente = e_pac;
      id_med = e_med;
      id_cli = e_cli;
    }

    // Crear tratamiento
    const result = await retornarQuery(
      `INSERT INTO tratamientos (
        id_evolucion, id_paciente, id_med, id_cli,
        descripcion, tipo_tratamiento, fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        evolId, id_paciente, id_med, id_cli,
        descripcion.trim(),
        tipo_tratamiento.trim()
      ]
    );

    return res.json({ success: true, datos: { id_tratamiento: result.data.insertId, id_evolucion: evolId } });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/ordenes-estudios/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  const {
    id_consulta,           // solo requerido si id_evolucion = 0
    id_tipo_estudio,
    descripcion,
    motivo,
    fecha_ejecucion
  } = req.body;

  // Validar id_evolucion
  if (id_evolucion === undefined || id_evolucion === null || (id_evolucion !== '0' && isNaN(id_evolucion))) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  // Validar campos comunes
  if (!id_tipo_estudio || isNaN(id_tipo_estudio)) {
    return res.status(400).json({ success: false, error: 'id_tipo_estudio inválido' });
  }
  if (!descripcion || descripcion.trim() === '') {
    return res.status(400).json({ success: false, error: 'La descripción del estudio es obligatoria' });
  }

  try {
    let evolId, id_paciente, id_med, id_cli;

    if (id_evolucion === '0') {
      // === CASO ESPECIAL: crear evolución automática ===
      if (!id_consulta || isNaN(id_consulta)) {
        return res.status(400).json({ success: false, error: 'id_consulta es obligatorio cuando id_evolucion = 0' });
      }

      // 1. Obtener contexto de la consulta
      const consultaResult = await retornarQuery(
        `SELECT id_paciente, id_med, id_cli FROM consultas WHERE id_consulta = ?`,
        [id_consulta]
      );
      if (consultaResult.data.length === 0) {
        return res.status(400).json({ success: false, error: 'Consulta no encontrada' });
      }
      const { id_paciente: c_pac, id_med: c_med, id_cli: c_cli } = consultaResult.data[0];

      // 2. Crear evolución mínima
      const evolResult = await retornarQuery(
        `INSERT INTO evoluciones (
          id_paciente, id_consulta, id_med, id_cli,
          tipo_evolucion, estado_paciente, motivo, firmada, fecha_hora
        ) VALUES (?, ?, ?, ?, 8, 'estable', 'Generada desde orden de estudio', FALSE, NOW())`,
        [c_pac, id_consulta, c_med, c_cli]
      );

      evolId = evolResult.data.insertId;
      id_paciente = c_pac;
      id_med = c_med;
      id_cli = c_cli;

    } else {
      // === CASO NORMAL: usar evolución existente ===
      const evolResult = await retornarQuery(
        `SELECT id_paciente, id_med, id_cli FROM evoluciones WHERE id_evolucion = ? AND firmada = FALSE`,
        [id_evolucion]
      );
      if (evolResult.data.length === 0) {
        return res.status(400).json({ success: false, error: 'Evolución no encontrada o ya firmada' });
      }
      const { id_paciente: e_pac, id_med: e_med, id_cli: e_cli } = evolResult.data[0];
      evolId = id_evolucion;
      id_paciente = e_pac;
      id_med = e_med;
      id_cli = e_cli;
    }

    // 3. Validar tipo de estudio
    const tipoResult = await retornarQuery(
      `SELECT id_tipo_estudio FROM tipo_estudio WHERE id_tipo_estudio = ? AND id_cli = ? AND activo = 1`,
      [id_tipo_estudio, id_cli]
    );
    if (tipoResult.data.length === 0) {
      return res.status(400).json({ success: false, error: 'Tipo de estudio no válido o inactivo' });
    }

    // 4. Crear orden de estudio
    const ordenResult = await retornarQuery(
      `INSERT INTO ordenes_estudios (
        id_evolucion, id_paciente, id_med, id_cli,
        id_tipo_estudio, descripcion, motivo, fecha_ejecucion,
        fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        evolId,
        id_paciente,
        id_med,
        id_cli,
        id_tipo_estudio,
        descripcion.trim(),
        motivo ? motivo.trim() : null,
        fecha_ejecucion || null
      ]
    );

    return res.json({ success: true, datos: { id_orden: ordenResult.data.insertId, id_evolucion: evolId } });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/:id_evolucion/recetas', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  try {
    const result = await retornarQuery(
      `SELECT 
        id_receta,
        nombre_medicamento,
        dosis,
        via_administracion,
        frecuencia,
        duracion,
        indicaciones,
        fecha_hora,
        firmada
       FROM recetas
       WHERE id_evolucion = ?
       ORDER BY fecha_hora ASC`,
      [id_evolucion]
    );

    return res.json({ success: true, datos: result.data });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/:id_evolucion/tratamientos', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  try {
    const result = await retornarQuery(
      `SELECT 
        id_tratamiento,
        descripcion,
        tipo_tratamiento,
        fecha_hora,
        firmada
       FROM tratamientos
       WHERE id_evolucion = ?
       ORDER BY fecha_hora ASC`,
      [id_evolucion]
    );

    return res.json({ success: true, datos: result.data });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/:id_evolucion/ordenes-estudios', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  try {
    const result = await retornarQuery(
      `SELECT 
        o.id_orden,
        o.id_tipo_estudio,
        t.descripcion AS tipo_estudio_nombre,
        o.descripcion,
        o.motivo,
        o.fecha_ejecucion,
        o.fecha_hora,
        o.firmada
       FROM ordenes_estudios o
       LEFT JOIN tipo_estudio t ON o.id_tipo_estudio = t.id_tipo_estudio
       WHERE o.id_evolucion = ?
       ORDER BY o.fecha_hora ASC`,
      [id_evolucion]
    );

    return res.json({ success: true, datos: result.data });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;