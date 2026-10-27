from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
from ui_helpers import google_off
base='http://127.0.0.1:8000'
def feature(name,lon,lat):return {'type':'Feature','geometry':{'type':'Point','coordinates':[lon,lat]},'properties':{'osm_type':'N','osm_id':1,'name':name,'country':'Taiwan','osm_value':'village'}}
# A tiny stand-in for the free map: it knows villages and some big places, but not the small farm.
MAP={'淋漓坪 大湖鄉':[feature('Linliping',120.8678,24.3839)],'清境農場':[feature('清境農場',121.1627,24.0585)],
     '大同村 仁愛鄉':[feature('Datong Village',121.1597,24.0836)],'Puli Brewery':[feature('Puli Brewery',121.5,25.0)],'Renai Township, Nantou County':[feature('Renai Township',121.1335,24.0244)]}
calls=[]
def photon(route):
 q=parse_qs(urlparse(route.request.url).query);calls.append(q);route.fulfill(json={'features':MAP.get(q['q'][0],[])})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context();page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.route('https://photon.komoot.io/**',photon);ctx.route('https://router.project-osrm.org/**',lambda r:r.abort())
 google_off(page);page.goto(base);page.wait_for_selector('.activity')
 locate=lambda place:page.evaluate('p=>orbitPlaces.locate(p)',place)
 # Not on the map by name: the address gives an approximate, labelled point (house number and village trimmed off).
 farm=locate({'name':'Red Glazed Tile Strawberry Farm','nameZh':'紅色琉璃瓦草莓園','address':'苗栗縣大湖鄉義和村淋漓坪96-6號'})
 assert farm=={'lat':24.3839,'lon':120.8678,'approx':'Linliping'},farm
 assert not any('96' in q['q'][0] for q in calls),calls
 # On the map by its Chinese name ("・" splits it), searched near the address: an exact point.
 calls.clear();qingjing=locate({'name':'Qingjing Farm · Green Green Grasslands','nameZh':'清境農場・青青草原','address':'南投縣仁愛鄉大同村仁和路170號'})
 assert qingjing=={'lat':24.0585,'lon':121.1627},qingjing
 near=[q for q in calls if q['q'][0]=='清境農場'];assert near and near[0]['lat']==['24.0836'],calls
 # A same-named place far from the address is the wrong one, so the approximate point wins.
 wrong=locate({'name':'Puli Brewery','address':'No. 1, Datong Village, Renai Township, Nantou County, Taiwan'})
 assert wrong=={'lat':24.0244,'lon':121.1335,'approx':'Renai Township'},wrong
 # Nothing recognisable: no point, rather than a guess.
 assert locate({'name':'Nowhere Café','address':'Somewhere Rd'}) is None
 # The card says the pin is approximate.
 card=page.evaluate("p=>orbitPlaces.card({id:'x',title:'Farm',notes:'',place:p})",{'name':'Farm','address':'苗栗縣大湖鄉義和村淋漓坪96-6號',**farm})
 assert 'approximate (near Linliping)' in card,card
 assert not errors,errors
 b.close()
print('address pin tests passed')
