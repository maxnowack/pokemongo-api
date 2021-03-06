
import Player from '~/Player'
import API from '~/API'
import Item from '~/Item'
import Pokemon from '~/Pokemon'
import Fort from '~/Fort'
import PlayerMap from '~/PlayerMap'
import { PAUSE_BETWEEN_REQUESTS } from '~/settings'

import rand from 'randgen'

/**
 * Called if a parameter is missing and
 * the default value is evaluated.
 */
function mandatory() {
    throw new Error('Missing parameter');
}


class PokemonGOAPI {

  constructor(props) {
    this.player = new Player(this)
    this.api = new API(this)
    this.map = new PlayerMap()
    this.logged = false
    this.debug = true
    this.useHeartBeat = false
    this.lastObjectsCall=0

    this.logging = (props && props.logging) != null
      ? props.logging
      : true // logging defaults to true
    
    this.requestInterval = (props && props.requestInterval) != null
      ? props.requestInterval
      : PAUSE_BETWEEN_REQUESTS // logging defaults to settings.js

  }

  get log() {
    const logMsg = (level) => (...args) => this.logging && console[level](...args)
    return {
      info: logMsg('info'),
      warn: logMsg('warn'),
      error: logMsg('error'),
    }
  }


  /**
   * [login description]
   *
   * @param  {[type]} username          [description]
   * @param  {[type]} password          [description]
   * @param  {[type]} provider          [description]
   * @param  {[type]} forceRefreshLogin [description]
   * @return {[type]}                   [description]
   */
  async login(username, password, provider, forceRefreshLogin) {
    if (provider !== 'ptc' && provider !== 'google') {
      throw new Error('Invalid provider')
    }

    this.player.provider = provider

    await this.player.Login(username, password, forceRefreshLogin)
    await this.api.setEndpoint(this.player.playerInfo)

    return this
  }



  /**
   * This calls the API direct
   *
   * @param  {[type]} req [description]
   * @return {[type]}     [description]
   */
  Call(req) {
    return this.api.Request(req, this.player.playerInfo)
  }



  /**
   * [GetInventory description]
   * @return {[type]}     [description]
   */
  async GetInventory() {
    let res = await this.Call([{
      request: 'GET_INVENTORY',
      message: {
        last_timestamp_ms: 0
      }
    }])

    let inventory = {
      pokemons: [],
      items: {},
      eggs: [],
      candies: []
    }

    var itemData = PokemonGOAPI.POGOProtos.Inventory.Item.ItemId
    itemData = Object.keys(itemData).reduce((obj, key) => {
      obj[ itemData[key] ] = key.toLowerCase().replace('item_', '')

      inventory.items[obj[itemData[key]]] = new PokemonGOAPI.POGOProtos.Inventory.InventoryItem
      return obj
    }, {})

    for(let thing of res.GetInventoryResponse.inventory_delta.inventory_items){
      let data = thing.inventory_item_data

      if (data.pokemon_data) {
        let pokemon = new Pokemon(data.pokemon_data, this)
        data.pokemon_data.is_egg
          ? inventory.eggs.push(pokemon)
          : inventory.pokemons.push(pokemon)
      } else if (data.item) {
        inventory.items[itemData[data.item.item_id]] = new Item(data.item, this)
      }
      else if (data.candy) {
        inventory.candies.push(new Item(data.candy, this))
      }
    }

    return inventory
  }




  /**
   * [GetPlayer description]
   */
  async GetPlayer(s) {
    let res = await this.Call([{ request: 'GET_PLAYER' }])
    this.player.playerInfo.sessionData = res.GetPlayerResponse.player_data
    return res.GetPlayerResponse.player_data
  }



  /**
   * [ToggleWalkToPoint description]
   * @param  {[type]} lat [description]
   * @param  {[type]} lng [description]
   * @return {[type]}     [description]
   */
  async ToggleWalkToPoint(lat,lng) {
    this.walkToPoint = !this.walkToPoint
    this._walkToPoint(lat, lng)
    return this.walkToPoint
  }



  /**
   * [_walkToPoint description]
   *
   * @private
   * @param  {[type]} lat [description]
   * @param  {[type]} lng [description]
   * @return {[type]}     [description]
   */
  async _walkToPoint(lat, lng) {
    while(this.walkToPoint){
      this.player.walkToPoint(lat, lng)
      await new Promise(resolve => setTimeout(resolve, 2700))
    }
  }



  /**
   * [ToggleHeartBeat description]
   */
  async ToggleHeartBeat() {
    this.useHeartBeat = !this.useHeartBeat
    this._loopHeartBeat()
    return this.useHeartBeat
  }



  /**
   * [_loopHeartBeat description]
   * @return {[type]} [description]
   */
  async _loopHeartBeat() {
    while(this.useHeartBeat){
      var area = this.GetMapObjects()
      this.log.info('[+] Sent out heartbeat: (player.surroundings is updated)')
      await new Promise(resolve => setTimeout(resolve, 2700))
    }
  }



  /**
   * [GetMapObjects description]
   */
  async GetMapObjects() {
    let callDiff = (this.lastObjectsCall + this.requestInterval)-Date.now()
    if (this.lastObjectsCall != 0 && callDiff > 0 ){
      this.log.info(`[!] We need ${this.requestInterval} ms wait between GetMapObjects calls - waiting: ${callDiff} ms`)
      await new Promise(resolve => setTimeout(resolve, callDiff))
    }


    let finalWalk = this.map.getNeighbors(this.player.playerInfo).sort()
    let nullarray = Array(21).fill(0) 
    let res = await this.Call([{
      request: 'GET_MAP_OBJECTS',
      message: {
        cell_id: finalWalk,
        since_timestamp_ms: nullarray,
        latitude: this.player.playerInfo.latitude,
        longitude: this.player.playerInfo.longitude
      }
    }])

    let cells = res.GetMapObjectsResponse.map_cells

    var objects = {
      spawn_points: [],
      deleted_objects: [],
      fort_summaries: [],
      decimated_spawn_points: [],
      wild_pokemons: [],
      catchable_pokemons: [],
      nearby_pokemons: [],
      forts: {
        checkpoints: [],
        gyms: []
      }
    }

    for(let cell of cells) {
      objects.spawn_points.push(cell.spawn_points)
      objects.deleted_objects.push(cell.deleted_objects)
      objects.fort_summaries.push(cell.fort_summaries)
      objects.decimated_spawn_points.push(cell.decimated_spawn_points)

      cell.wild_pokemons.map(pokemon => {
        pokemon.pokemon_id = pokemon.pokemon_data.pokemon_id,
        objects.wild_pokemons.push(new Pokemon(pokemon, this))
      })

      cell.catchable_pokemons.map(pokemon => {
        pokemon.catchable = true
        objects.catchable_pokemons.push(new Pokemon(pokemon, this))
      })

      cell.nearby_pokemons.map(pokemon =>
        objects.nearby_pokemons.push(new Pokemon(pokemon, this))
      )

      cell.forts.map(fort => {
        fort = Fort(fort, this)

        if (fort.isCheckpoint)
          objects.forts.checkpoints.push(fort)
        else
          objects.forts.gyms.push(fort)
        }
      )
    }

    // sort forts
    objects.forts.checkpoints.sort((a, b) => a.distance - b.distance)
    objects.forts.gyms.sort((a, b) => a.distance - b.distance)

    this.player.surroundings = objects
    this.lastObjectsCall = Date.now()
    return objects
  }

}

PokemonGOAPI.POGOProtos = API.POGOProtos

export default PokemonGOAPI
