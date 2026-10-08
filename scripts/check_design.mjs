import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve,launchOptions,ready} from './ui_helpers.mjs';
const host=await serve(),browser=await chromium.launch(launchOptions),page=await browser.newPage({viewport:{width:1280,height:800}});
const folder='artifacts/ui-design-states';await mkdir(folder,{recursive:true});
const report=[];
async function record(name){
 const values=await page.locator('#homeFeed .product-row').evaluateAll(rows=>rows.slice(0,5).map(row=>{const s=getComputedStyle(row);return [s.backgroundColor,s.borderTopWidth,s.borderRadius,s.boxShadow,s.getPropertyValue('--background'),s.getPropertyValue('--padding-start')]}));
 assert.ok(values.every(value=>JSON.stringify(value)===JSON.stringify(values[0])),name+' row surfaces differ');
 report.push({state:name,peerSurfacesEqual:true,surface:values[0]});await page.screenshot({path:`${folder}/${name}.png`});
}
try{
 await page.goto(host.base+'/#/');await ready(page);await record('home-default');
 await page.locator('#homeFeed .product-row').first().locator('button').focus();await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'ION-ITEM','Keyboard enters native Ionic row');
 await page.screenshot({path:`${folder}/keyboard-focus.png`});
 await page.goto(host.base+'/#/ai-discovery');await ready(page);
 await page.locator('#discoveryFilters [data-filter="recommended"]').click();
 const backs=await page.locator('.catalog-card.is-recommended').evaluateAll(cards=>cards.map(card=>getComputedStyle(card,'::before').backgroundImage));
 assert.ok(backs.length===3 && backs.every(back=>back===backs[0]),'Recommendation colors differ by position');report.push({recommendationBacksEqual:true});
 await page.screenshot({path:`${folder}/discovery-recommended.png`});
 await page.locator('#resetDiscoveryFilters').click();
 const edges=await page.locator('.paper-edge').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundImage));
 assert.ok(edges.length>0 && edges.every(edge=>edge===edges[0] && edge!=='none'),'Ordinary cards share the brand cross-section');
 report.push({ordinaryCardsShareBrand:true});
 const palette=[['#292535','#ffffff'],['#606775','#f8f9fc'],['#687180','#f4f5f9'],['#5b3fc4','#f0ecfb'],['#ffffff','#5b3fc4']];
 const lum=hex=>{const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 for(const [foreground,background]of palette){const a=lum(foreground),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,foreground+' fails contrast');report.push({foreground,background,contrast:Math.round(ratio*100)/100});}
 await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log('PASS: peer row surfaces across sort/filter states, shared recommendation material, text contrast');
}finally{await browser.close();await host.close()}
