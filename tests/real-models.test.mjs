import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRealModel} from '../src/lib/real-models.ts';
const origin='https://ddf.example';
const profile=()=>({id:'00000000-0000-4000-8000-000000000000',name:'Modelo real',brand:'Dive',measurements:{heightCm:180,weightKg:80},photos:[],notes:'Roupa neutra',revision:0});
test('pasta de modelo mantém medidas desconhecidas vazias',()=>{const model=validateRealModel(profile(),origin);assert.equal(model.measurements.heightCm,180);assert.equal(model.measurements.waistCm,null);assert.equal(model.photos.length,0);});
test('medidas impossíveis e fotos externas não entram no cadastro',()=>{assert.throws(()=>validateRealModel({...profile(),measurements:{heightCm:-1}},origin),/Medida/);assert.throws(()=>validateRealModel({...profile(),photos:[{url:'https://supplier.example/a.jpg',angle:'Frente',mimeType:'image/jpeg',checksum:'a'.repeat(64),bytes:10}]},origin),/Foto/);});
test('foto neutra preserva arquivo e postura',()=>{const photo={url:origin+'/api/media?id=00000000-0000-4000-8000-000000000001',angle:'Frente, corpo inteiro',mimeType:'image/jpeg',checksum:'a'.repeat(64),bytes:10};assert.deepEqual(validateRealModel({...profile(),photos:[photo]},origin).photos,[photo]);});

test('referências de mãos mantêm lado e medidas de acessórios',()=>{const photo={url:origin+'/api/media?id=00000000-0000-4000-8000-000000000001',angle:'Mão esquerda / dorso',framing:'MAOS',mimeType:'image/jpeg',checksum:'a'.repeat(64),bytes:10};const model=validateRealModel({...profile(),measurements:{wristCm:17,handLengthCm:19},photos:[photo]},origin);assert.equal(model.photos[0].framing,'MAOS');assert.equal(model.photos[0].angle,'Mão esquerda / dorso');assert.equal(model.measurements.wristCm,17);assert.equal(model.measurements.handWidthCm,null);});
