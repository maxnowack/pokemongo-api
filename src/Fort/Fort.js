import geolib from 'geolib'

class Fort {
  constructor(props, parent) {
    Object.assign(this, props)
    Object.defineProperty(this, 'parent', {value: parent})
  }



  /**
   * Return the coordinates of the fort
   * @return {Object} {latitude, longitude}
   */
  get location() {
    let { latitude, longitude } = this
    return { latitude, longitude }
  }



  /**
   * Return the distance in meters from players location
   * to the Checkpoint or Gym`s location
   *
   * @return {Number} meters
   */
  get distance() {
    return geolib.getDistance(this.location, this.parent.player.location)
  }



  /**
   * Tells you if you are close enough to do something with it
   *
   * @return {Boolean} true if you can reach it
   */
  get withinRange() {
    return this.distance < 40
  }



  /**
   * TODO: description
   *
   * [addModifier description]
   * @param {[type]} item_id [description]
   */
  addModifier(item_id){
    let {latitude, longitude} = this.parent.player.location

    return this.parent.Call([{
      request: 'FORT_DETAILS',
      message: {
        modifier_type: item_id,
        fort_id: this.id,
        player_latitude: latitude,
        player_longitude: longitude
      }
    }])
  }

}
export default Fort
