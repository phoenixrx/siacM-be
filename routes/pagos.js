// routes/admisiones.js
const express = require("express");
const router = express.Router();
const { retornarQuery } = require("../auth");
const {
  authenticateToken,
  registrarErrorPeticion,
} = require("../middlewares/autenticarToken");
const { buildUpdateQuery } = require('../funciones/funciones_comunes_be');
const { Console } = require("winston/lib/winston/transports");

// GET /api/pagos
router.get("/recibo-detalle/:id_admision", async (req, res) => {
  const id_admision = req.params.id_admision;  
  if (!id_admision || isNaN(id_admision)) {
    return res.status(422).json({ error: "Id invalido" });
  }

  let query_adm = `
  SELECT 
        cp.id_control_pago,
        cp.id_externa,
        cp.tipo,
        cp.id_forma_pago,
        cp.monto,
        cp.id_moneda,
        cp.nota,
        cp.fecha_creacion,
        cp.fecha_modificacion,
        cp.activo,
        cp.id_cli,
        fp.descripcion AS forma_pago,
        m.descripcion AS Moneda,
        m.simbolo
    FROM control_pagos cp
    INNER JOIN formas_pago fp ON fp.id_forma_pago = cp.id_forma_pago
    INNER JOIN monedas m ON m.id_moneda = cp.id_moneda
    WHERE cp.id_externa = ? AND cp.activo = 1;`;

  try {
    let recibos = await retornarQuery(query_adm, [id_admision]);

    if(recibos.data.length==0){
        return res.json({ 
            success:false,
            error:"No se encontraron recibos"
        });
        
    }
    res.json({ recibo: recibos});
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      error: error     
    });
    return;
  }
});

router.get("/recibo-detalle/:factura/:id_cli", async (req, res) => {
  const id_cli = req.params.id_cli;  
  const factura = req.params.factura;  
  if (!id_cli || isNaN(id_cli)) {
    return res.status(422).json({ error: "Id invalido" });
  }

  if (!factura) {
    return res.status(422).json({ error: "Factura invalida" });
  }

  let query_adm = `
  SELECT 
        cp.id_control_pago,
        cp.id_externa,
        cp.tipo,
        cp.id_forma_pago,
        cp.monto,
        cp.id_moneda,
        cp.nota,
        cp.fecha_creacion,
        cp.fecha_modificacion,
        cp.activo,
        cp.id_cli,
        fp.descripcion AS forma_pago,
        fp.credito,
        m.descripcion AS Moneda,
        m.simbolo
    FROM control_pagos cp
    INNER JOIN formas_pago fp ON fp.id_forma_pago = cp.id_forma_pago
    INNER JOIN monedas m ON m.id_moneda = cp.id_moneda
    WHERE cp.tipo = CONCAT("Factura ", ?) AND cp.id_cli = ? AND cp.activo=1;`;

  try {
    let recibos = await retornarQuery(query_adm, [factura, id_cli]);
    
    if(recibos.data.length==0){
        return res.json({ 
            success:false,
            error:"No se encontraron recibos"
        });
        
    }
    res.json({ recibo: recibos});
  } catch (error) {
    console.log(error)
    registrarErrorPeticion(req, error);
    res.status(500).json({
      error: error     
    });
    return;
  }
});

router.patch("/modificar-forma-pago/:id_forma", authenticateToken,
  async (req, res) => {
  const { id_forma } = req.params;
   const {id_forma_pago,id_moneda, id_usuario}=req.body;
  if (!id_forma || !id_usuario) {
    return res.status(400).json({ 
      success: false,
      error: 'Faltan campos obligatorios' 
    });
  }
  if(isNaN(id_forma)){
    return res.status(400).json({
      success: false,
      error: 'Campos no validos'
    })
  }
  

  if(id_forma_pago !== null && isNaN(id_forma_pago)){
    return res.status(400).json({
      success:false,
      error:'La forma de pago es invalida'
    });
  }  
  if(id_moneda !== null && isNaN(id_moneda)){
    return res.status(400).json({
      success:false,
      error:'La moneda de pago es invalida'
    });
  }  
 
  try {
      let checkMonedaQuery = `
        SELECT id_moneda FROM formas_pago WHERE id_forma_pago = ?  
      `
      let moneda = await retornarQuery(checkMonedaQuery, [id_forma_pago]);
      
      if(moneda.data[0].id_moneda!=id_moneda){
        return res.json({
          success: false,
          error: "La moneda no coincide con la forma de pago"
        });
      }
      let query = 
        `UPDATE 
            control_pagos 
          SET 
            id_moneda = ?, 
            id_forma_pago = ?, 
            nota=CONCAT('FP modificada por ', ?, ' ', nota ) 
          WHERE 
            id_control_pago = ?`

      const result = await retornarQuery(query, [id_moneda, id_forma_pago, id_usuario, id_forma]);
      return res.json({
        success: true,
        datos: result
      });
    } catch (error) {
      registrarErrorPeticion(req, error);
      return res.status(500).json({
        success: false,
        error: error
      })
    }
})

module.exports = router;