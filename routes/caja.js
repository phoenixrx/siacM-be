// routes/caja.js
const express = require('express');
const router = express.Router();
const { retornar_query } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');

// GET /api/caja 
router.delete('/usuarios/:id_caja', authenticateToken, async (req, res) => {
    const {id_caja} = req.params;

    if(!id_caja || isNaN(id_caja)){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }

    try {
        const query = `
        DELETE FROM caja_usuarios WHERE id=?;`
        
        const resultado = await retornar_query(query,[id_caja]);

        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la admision',
            details: error.message
        });
    }
});
router.post('/usuarios', authenticateToken,   async (req, res) => {
    const {usuario, id_caja} = req.body;

    if(!usuario || !id_caja ){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }
   

    try {
        let query_validar = `
        SELECT id FROM usuarios WHERE usuario=?;`

        const resultado_validar = await retornar_query(query_validar,[usuario]);

        if(resultado_validar.error){
            return res.status(400).json({
                success: false,
                error: 'El usuario no existe'
            });
        }

        let ususario = resultado_validar[0].id;

        const query = `
        INSERT INTO caja_usuarios (id_usuario, id_caja) values (?,?) ;`
        
        const resultado = await retornar_query(query,[ususario, id_caja]);

        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la admision',
            details: error.message
        });
    }
});

router.put('/caja', authenticateToken,  async (req, res) => {
    const {id_caja, descripcion} = req.body;

    if(!id_caja || isNaN(id_caja)){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }
    if(descripcion.length>50 || descripcion.length<5){
        return res.status(400).json({
            success: false,
            error: 'La descripcion debe tener entre 5 y 50 caracteres'
        });
    }

    try {
        const query = `
        UPDATE cajas SET descripcion=? WHERE id=?;`

        const resultado = await retornar_query(query,[descripcion,id_caja]);

        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la caja',
            details: error.message
        });
    }
});

router.post('/caja', authenticateToken,  async (req, res) => {
    const {id_cli, descripcion} = req.body;

    if(!id_cli || isNaN(id_cli)){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }
    if(descripcion.length>50 || descripcion.length<5){
        return res.status(400).json({
            success: false,
            error: 'La descripcion debe tener entre 5 y 50 caracteres'
        });
    }

    try {
        const query = `
        INSERT INTO cajas (id_cli, descripcion) values (?,?);`

        const resultado = await retornar_query(query,[id_cli,descripcion]);

        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al crear la caja',
            details: error.message
        });
    }
});

router.patch('/facturas_controles', authenticateToken,  async (req, res) => {
    const {id_caja, campo, valor} = req.body;

    if(!id_caja || isNaN(id_caja) || !campo || !valor || isNaN(valor) ){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }
    
    if(campo!='num_factura' && campo!='num_control' && campo!='num_recibo'){
        return res.status(400).json({
            success: false,
            error: 'Campos incorrectos'        
        });
    }

    try {
        const query = `
        UPDATE 
            facturas_controles 
        SET ${campo}=? 
        WHERE id_caja=?;`

        const resultado = await retornar_query(query,[valor, id_caja]);

        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el numero de recibo',
            details: error.message
        });
    }
});

module.exports = router;