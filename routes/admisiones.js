// routes/admisiones.js
const express = require("express");
const router = express.Router();
const { ejecutarTransaccion, retornarQuery } = require("../auth");

const {
  authenticateToken,
  registrarErrorPeticion, registrarInicioPeticion
} = require("../middlewares/autenticarToken");
const contenedor_query = require("../queries");
const {
  registrarAdmision,
  actualizarAdmisionDet,
  registrarDetalleAdmision,
  actualizarAdmision,
} = require("../schemas/admision");

// GET /api/admisiones
router.patch("/admision/:id_admision", authenticateToken,async (req, res) => {
  const id_admision = req.params.id_admision;
  const result = await actualizarAdmision(req.body);
  if (result.error) {
    return res.status(422).json({ error: JSON.parse(result.error.message) });
  }
  const filtros = { ...result.data };
  const setClause = Object.keys(filtros)
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = [...Object.values(filtros), id_admision];

  let query_adm = `UPDATE admisiones SET ${setClause}
                  WHERE id_admision=?`;

  try {
    let admision = await retornarQuery(query_adm, values);

    res.json({ cantidad_rows: admision.data.affectedRows });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      error: error,
      result,
      setClause,
      values,
      admision,
    });
    return;
  }
});

router.post("/crear-admision-detalle",authenticateToken, async (req, res) => {
  const result = await registrarDetalleAdmision(req.body);
  if (result.error) {
    return res.status(422).json({ error: JSON.parse(result.error.message) });
  }

  const filtros = { ...result.data };
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
                    cambio,
                    id_usuario)                     
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

      
  try {
    let admision_det = await retornarQuery(query, [
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
      filtros.cambio,
      filtros.id_usuario,
    ]);    
    res.json({ id_admidet: admision_det.data.insertId, id_admision: filtros.id_admision});
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error.message });
    return;
  }
});

router.post("/crear-admision-descuento", authenticateToken, async (req, res) => {
  const {id_admision, id_promocion, id_usuario, monto, monto_us} = req.body;
  if(!id_admision || !id_promocion || !id_usuario || !monto || !monto_us){
    return res.status(422).json({ 
      success:false,
      error: 'Faltan parámetros obligatorios' });
  }
  if(isNaN(id_admision) || isNaN(id_promocion) || isNaN(id_usuario) || isNaN(monto) || isNaN(monto_us)){
    return res.status(422).json({ 
      success:false,
      error: 'Parámetros incorrectos' });
  }
  let query=`INSERT INTO admisiones_descuentos 
        (id_admision, id_promocion, id_usuario, monto, monto_us)
        VALUES (?,?,?,?,?)`;

  let queryPromo = `UPDATE promociones SET 
        cantidad_restante=cantidad_restante-1 
        WHERE id_promocion=? AND ilimitado=1`;

const consultas = [
    {
      query: query,
      params: [id_admision, id_promocion, id_usuario, monto, monto_us],
    },
    {
      query: queryPromo,
      params: [id_promocion],
    }];

  try {    

    const resultado = await ejecutarTransaccion(consultas);

    if (!resultado.success) {
      registrarErrorPeticion(req, new Error(resultado.error));
      return res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
        error: resultado.error ,
      });
    }

    const [admisionPromo, promoResult] = resultado.data;

    return res.json({
      success: true,
      admisionPromo: admisionPromo.affectedRows,
      promoResult: promoResult.affectedRows,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({ error: error.message });
    return;
  }
  
})

router.patch("/tipo-admision/:id_admision", authenticateToken, async (req, res) => {

  const id_admision = req.params.id_admision;
  const { tipo, valor, subValor = 0 } = req.query;
    let camposActualizable = "";
    switch (tipo) {
      case "P":
        camposActualizable = `id_seguro=0,id_empresa=0, id_tipo_interno=0`;
        break;
      case "E":
        camposActualizable = `id_empresa=${valor}, id_seguro=0, id_tipo_interno=0`;
        break;
      case "S":
        camposActualizable = `id_seguro=${valor}, id_empresa=0, id_tipo_interno=0`;
        break;
      case "I":
        camposActualizable = `id_tipo_interno=${valor}, id_seguro=0,id_empresa=0`;
        break;
      default:
        return res.status(422).json({ error: "Tipo incorrecto" });
    }

    if (isNaN(valor)) {
      return res.status(422).json({ error: "Valor incorrecto" });
    }

    let query_adm = `UPDATE admisiones SET tipo_consulta =?, id_subempresa=${subValor}, ${camposActualizable}
                  WHERE id_admision=?`;
    try {
      let admision = await retornarQuery(query_adm, [tipo, id_admision]);

      res.json({ cantidad_rows: admision.data.affectedRows });
    } catch (error) {
      registrarErrorPeticion(req, error);
      res.status(500).json({ error: "No existe admision ", detalle: error });
      return;
    }
  }
);

router.post("/buscar-admisiones", async (req, res) => {
  try {
    
    const { id_cli, page = 1, perPage = 5, tipo, filtro } = req.body;
    const offset = (page - 1) * perPage;
    let filtro_query = "";
    if (tipo) {
      switch (tipo) {
        case "factura":
          filtro_query = `AND a.factura = '${filtro}'`;
          break;
        case "recibo":
          filtro_query = `AND a.consec_recibo = '${filtro}'`;
          break;
        case "admision":
          filtro_query = `AND a.id_admision = '${filtro}'`;
          break;
        case "cedula":
          filtro_query = `AND p.cedula LIKE '${filtro}%'`;
          break;
        case "paciente":
          filtro_query = `AND LOWER(CONCAT(p.nombres, ' ', p.apellidos)) LIKE '%${filtro}%'`;
          break;
        default:
          break;
      }
    }

    let query = `SELECT 
            a.fecha_admision,
            a.id_admision,
            a.tipo_consulta,
            a.activo,
            a.factura,
            a.consec_recibo,
            a.solo_ppto,
            SUM(ad.precio * ad.cantidad) AS precio,
            SUM(ad.precio_usd * ad.cantidad) AS precio_usd,
            SUM(ad.cantidad) AS cantidad,
            CONCAT(p.tipo_cedula, '-', p.cedula) AS cedula_paciente,
            CONCAT(p.nombres, ' ', p.apellidos) AS nombre_paciente              
        FROM 
            admisiones a
        INNER JOIN 
            admisiones_det ad ON ad.id_admision = a.id_admision
        INNER JOIN 
            pacientes p ON a.id_paciente = p.id_paciente
        WHERE
            a.id_cli =? AND
            ad.activo=1 AND
            a.activo=1 
            ${filtro_query}  
          GROUP BY a.id_admision
          ORDER BY a.id_admision DESC LIMIT ? OFFSET ?`;

    const params = [id_cli, perPage, offset];

    const result = await retornarQuery(query, params);

    if (result.error) {
      return res.json({
        success: false,
        error: "no data",
      });
    }
    // Consulta de conteo
    const countResult = await retornarQuery(
      `SELECT COUNT(a.id_admision) as total,
                COUNT(DISTINCT a.id_admision) as total_admisiones,
                COUNT(DISTINCT a.id_paciente) AS total_pacientes
        FROM 
            admisiones a
        INNER JOIN 
            admisiones_det ad ON ad.id_admision = a.id_admision
        INNER JOIN 
            pacientes p ON a.id_paciente = p.id_paciente
              
        WHERE
            a.id_cli =? AND
            ad.activo=1 AND
            a.activo=1 
            ${filtro_query}  
        `,
      [id_cli]
    );

    const total_admisiones = countResult.data[0]?.total_admisiones || 0;
    
    const totalPages =
      Math.ceil(total_admisiones / perPage) <= 10
        ? Math.ceil(total_admisiones / perPage)
        : 10;

    res.json({
      success: true,
      resultados: result,
      pagination: {
        page,
        perPage,
        totalPages,
        total_admisiones,
      },
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });
  }
});

router.patch("/admision_detalle/:id_admidet", authenticateToken, async (req, res) => {
  const id_admidet = req.params.id_admidet;
  const result = await actualizarAdmisionDet(req.body);
 
  if (result.error) {
    registrarErrorPeticion(req, error);
    return res.status(422).json({ error: JSON.parse(result.error.message) });
  }
  const filtros = { ...result.data };
  const setClause = Object.keys(filtros)
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = [...Object.values(filtros), id_admidet];

  let query_adm = `UPDATE admisiones_det SET ${setClause}
                  WHERE id_admidet=?`;

  try {
    let admision = await retornarQuery(query_adm, values);

    res.json({ cantidad_rows: admision.data.affectedRows });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      error: error
    });
    return;
  }
});

router.patch("/cambiar-precio-tasa/:id_admision", authenticateToken,  async (req, res) => {
  const id_admision = req.params.id_admision;
  const {tasa} = req.body;
  if(!tasa || isNaN(tasa)){
    return res.status(422).json({ error: 'Tasa invalida' });
  }
  let query_detalle = `UPDATE 
                    admisiones_det 
                  SET 
                    cambio=?, 
                    precio=(precio_usd * ? )
                  WHERE id_admision=?`;

  let query_adm = `UPDATE 
                    admisiones 
                  SET 
                    tasa=?
                  WHERE id_admision=?`;

  try {
    let admision = await retornarQuery(query_adm, [tasa,  id_admision]);    
    if(admision.data?.affectedRows==0){
       registrarErrorPeticion(req, 'Admision inexistente');
      return res.status(422).json({ error: 'Admision inexistente' });
    }
    let admision_det = await retornarQuery(query_detalle, [tasa, tasa, id_admision]);    
    res.json({ 
      success: true,
      admision_det: admision_det.data.affectedRows,
      admision: admision.data.affectedRows
     });
  } catch (error) {
    registrarErrorPeticion(req,error)
    res.json({ 
      success: false,
      error: error.message
     });
  }                  
})

router.get("/ficha/:id_admision", async (req, res) => {
  const id_admision = req.params.id_admision;
  try {
    
    let admision = await retornarQuery(contenedor_query[1][0], [id_admision]);
    let detalles = await retornarQuery(contenedor_query[1][1], [id_admision]);
    let promos = await retornarQuery(contenedor_query[1][6], [id_admision]);
    
    res.json({
      success: true,
      admision: admision.data,
      detalles: detalles.data,
      promos: promos.data,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });
  }
})

router.post("/crear-nota/:id_paciente", authenticateToken, async (req, res) => {
    const id_paciente = req.params.id_paciente;
    const { nota, id_cli } = req.body;
    if(id_paciente==1){
        return res.status(401).json({ error: 'Prohibido' });
    }

    let query=`
        INSERT INTO notas_paciente (nota, id_paciente, id_cli)
        VALUES (?, ?, ?)`;
    let params = [nota, id_paciente, id_cli];    

    if (nota==""){
        query=`DELETE FROM notas_paciente WHERE id_paciente=? AND id_cli=?`;
        params = [id_paciente, id_cli];
    }

    try {
        const result = await retornarQuery(query, params);
        res.json({
            success: true,
            message: 'Nota guardada correctamente.',
            data: result            
        });
    } catch (error) {
        registrarErrorPeticion(req, error);
        res.status(500).json({ error: 'Error al guardar la nota.' });
    }    
})

router.get("/admisiones-abiertas/", async (req, res) => {
  const { id_cli, id_paciente } = req.query;

  if (!id_cli || !id_paciente) {
    return res.status(422).json({ error: "Faltan parámetros obligatorios" });
  }
  if(isNaN(id_cli) || isNaN(id_paciente)){
    return res.status(422).json({ error: "Parámetros incorrectos" });
  }

  let query =`
  SELECT 
      a.id_admision,
      a.fecha_admision,
      SUM(ad.precio * ad.cantidad) AS total,
      SUM(ad.precio_usd * ad.cantidad) AS total_usd,
      a.solo_ppto
  FROM 
      admisiones a
      INNER JOIN admisiones_det ad ON a.id_admision = ad.id_admision
      INNER JOIN pacientes p ON a.id_paciente = p.id_paciente
  WHERE 
      a.activo = 1
      AND ad.activo = 1
      AND a.id_cli = ?
      AND a.id_paciente = ?
      AND a.id_status_cierre = 1
  GROUP BY 
      a.id_admision,
      a.fecha_admision,
      a.solo_ppto;
  `;

  try {
    const result = await retornarQuery(query, [id_cli, id_paciente]);
    
    if (result.error) {
      return res.json({
        success: false,
        error: "no data",
      });
    }
    if(result.data.length==0){
      return res.json({
        success: false,
      })
    }
    res.json({
      success: true,
      detalle: result.data,
    });
    
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });    
  }
})

router.delete("/admision/:id_admision", authenticateToken,async (req, res) => {
  const { usuario } = req.body;
  const { id_admision } = req.params;

  if (!usuario || !id_admision) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
  }

  const idAdmisionNum = Number(id_admision);

  if (!Number.isInteger(idAdmisionNum) || idAdmisionNum <= 0 ) {
    return res.status(400).json({ error: 'IDs deben ser enteros positivos válidos' });
  }

  const notaEliminacion = ` Eliminado por ${usuario}`.substring(0, 200); 

  const consultas = [
    {
      query: `
        UPDATE control_pagos 
        SET activo = 0, nota = CONCAT(IFNULL(nota, ''), ?)
        WHERE id_externa = ?
      `,
      params: [notaEliminacion, idAdmisionNum],
    },
    {
      query: `
        UPDATE admisiones 
        SET activo = 0, nota = CONCAT(IFNULL(nota, ''), ?)
        WHERE id_admision = ?
      `,
      params: [notaEliminacion, idAdmisionNum],
    },
    {
      query: `
        UPDATE almacen_movimientos
        SET cantidad = 0, descripcion = CONCAT(IFNULL(descripcion, ''), ' admision anulada')
        WHERE id_admidet IN (
          SELECT id_admidet
          FROM admisiones_det
          WHERE id_admision = ?
        )
      `,
      params: [idAdmisionNum],
    },
  ];

  try {

    let queryComprobacion =`
    SELECT id_status_cierre FROM admisiones WHERE id_admision = ?
    `;
    let comprobacion = await retornarQuery(queryComprobacion, [idAdmisionNum]);

    if(comprobacion.data.length<1 || comprobacion.data[0].id_status_cierre!=1 ){
      return res.json({
        success: false,
        message: "La admision esta cerrada",
      });
    }

    const resultado = await ejecutarTransaccion(consultas);

    if (!resultado.success) {
      registrarErrorPeticion(req, new Error(resultado.error));
      return res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
        error: resultado.error ,
      });
    }

    const [anularPagos, anularAdmision, anularAlmacen] = resultado.data;

    return res.json({
      success: true,
      anularPagos: anularPagos.affectedRows,
      anularAdmision: anularAdmision.affectedRows,
      anularAlmacen: anularAlmacen.affectedRows,
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({
      success: false,
      message: "Error inesperado",
      error: error.message ,
    });
  }
});

router.delete("/promociones/", authenticateToken, async (req, res) => {
  
  const { id_promocion, id_detalle } = req.body;

  if ( !id_promocion || !id_detalle) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
  }

  const idPromocionNum = Number(id_promocion);

  if (!Number.isInteger(idPromocionNum) || idPromocionNum <= 0 ) {
    return res.status(400).json({ error: 'IDs deben ser enteros positivos válidos' });
  }  

  let query=`SELECT ilimitado FROM promociones WHERE id_promocion=?`;

  let queryRestaurarPromo = `
    UPDATE promociones 
    SET cantidad_restante = cantidad_restante + 1 
    WHERE id_promocion = ? `;

  let queryDetalle = `
    UPDATE admisiones_descuentos 
    SET activo = 0 
    WHERE id_admision_descuento = ? `;

  try {

    let comprobacion = await retornarQuery(query, [idPromocionNum]);
    if(comprobacion.data.length<1){
      return res.json({
        success: false,
        message: "La promocion no existe",
      });
    }
    const resultado = await retornarQuery(queryDetalle, [id_detalle]);
    
    if (resultado.data.affectedRows<1) {
      registrarErrorPeticion(req, new Error(resultado.error));
      return res.status(500).json({
        success: false,
        message: "No existe ese detalle",
        error: resultado.error ,
      });
    }
    if(comprobacion.data[0].ilimitado==0 ){
      let restaurarPromo = await retornarQuery(queryRestaurarPromo, [idPromocionNum]);
    
    }

   return res.json({
      success: true,
      data: resultado.data
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({
      success: false,
      message: "Error inesperado",
      error: error.message ,
    });
  }
});

router.get("/estudios-combos/:id_combo", async (req, res) => {
  const id_combo = req.params.id_combo;
  if(!id_combo){
    return res.status(422).json({ error: 'Faltan parámetros obligatorios' });
  }
  if(isNaN(id_combo)){    
    return res.status(422).json({ error: "Parámetro incorrecto" });
  }
  
  let query= `
  SELECT 
        combos_estudios_det.id_estudio,
        combos_estudios_det.precio_usd,
        estudios.descripcion
  FROM combos_estudios_det
  INNER JOIN estudios ON combos_estudios_det.id_estudio = estudios.id_estudio
  WHERE combos_estudios_det.id_combo = ?`;
try {
    const result = await retornarQuery(query, [id_combo]);
    if (result.error) {
      return res.json({
        success: false,
        error: "no data",
      });
    }
    res.json({
      success: true,
      detalle: result.data,
    });
} catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });      
}
})

router.get('/insumo-entrega-consultorio/:id_insumo', async (req, res) => {
  const {id_consultorio} = req.query
  const id_insumo = req.params.id_insumo;  
  if(!id_insumo|| !id_consultorio){
    return res.status(422).json({ error: 'Faltan parámetros obligatorios' });
  }
  if(isNaN(id_insumo)|| isNaN(id_consultorio)){    
    return res.status(422).json({ error: "Parámetro incorrecto" });
  }

  let query = `SELECT 
            e.descripcion AS insumo, 
            en.lote,
            en.id_entrega, 
            en.fecha_vencimiento, 
            SUM(am.cantidad) AS cantidad, 
            am.id_insumo, 
            am.id_almacen, 
            c.id_consultorio, 
            c.descripcion AS desc_consultorio, 
            a.descripcion AS almacen 
        FROM 
            almacen_movimientos am 
            INNER JOIN estudios e ON e.id_estudio = am.id_insumo 
            LEFT JOIN entregas en ON en.id_entrega = am.id_entrega 
            INNER JOIN almacenes a ON a.id_almacen = am.id_almacen 
            INNER JOIN almacenes_consultorio ac ON ac.id_almacen = a.id_almacen 
            INNER JOIN consultorios c ON c.id_consultorio = ac.id_consultorio 
        WHERE 
            c.id_consultorio = ?
            AND am.id_insumo = ?                     
        GROUP BY insumo, am.id_insumo, am.id_almacen, a.descripcion
        ORDER BY en.fecha_vencimiento DESC;`;

  try {
    const result = await retornarQuery(query, [id_consultorio,id_insumo]);
    if (result.error) {
      return res.json({
        success: false,
        error: "no data",
      });
    }
    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });      
  }
})

router.get('/facturas-pendientes/:id_cli', async (req, res) => {
  const id_cli = req.params.id_cli
  const {id_paciente} = req.query;
  if(!id_cli || !id_paciente){
    return res.status(422).json({ error: 'Faltan parámetros obligatorios' });
  }
  if(isNaN(id_cli) || isNaN(id_paciente)){    
    return res.status(422).json({ error: "Parámetro incorrecto" });
  }

  let query = `
  SELECT 
    f.id_factura,
    f.factura,
    f.razon_social,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.cuotas,
    f.id_admision,
    a.id_paciente,
    cp.monto AS monto_inicial,
    m.simbolo AS moneda,
    fp.descripcion AS forma_pago,
    SUM(cup.monto_pago) AS monto_pendiente
FROM facturas f
INNER JOIN admisiones a ON a.id_admision = f.id_admision
INNER JOIN control_pagos cp ON cp.id_externa = f.id_admision
INNER JOIN monedas m ON cp.id_moneda = m.id_moneda
INNER JOIN formas_pago fp ON cp.id_forma_pago = fp.id_forma_pago
INNER JOIN cuotas_pagar cup ON cup.id_admision = f.id_admision
WHERE f.id_cli = ?
  AND f.contado = 0
  AND f.activo = 1
  AND cp.activo = 1 
  AND a.id_paciente = ?
  AND fp.credito = 1
  AND cup.activo = 1 
  AND cup.estado != 'Pagado' 
GROUP BY
    f.id_factura,      
    f.factura,
    f.razon_social,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.cuotas,
    f.id_admision,
    a.id_paciente,
    cp.monto,          
    m.simbolo,
    fp.descripcion
  HAVING
    SUM(cup.monto_pago) > 0;
  `;

  try {
    const result = await retornarQuery(query, [id_cli, id_paciente]);
    if (result.error) {
      return res.json({
        success: false,
        error: "no data",
      });
    }
    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });      
  }
  
})

module.exports = router;