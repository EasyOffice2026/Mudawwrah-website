import * as menuImport from '../services/menuImportService.js';

// Importing the menu from a spreadsheet (the website reads the file and sends its rows): preview, then apply.
export const preview = async (req, res) => res.json(await menuImport.preview(req.body?.rows));
export const apply = async (req, res) => res.json(await menuImport.apply(req.body?.rows));
