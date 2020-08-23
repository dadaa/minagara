class App {
  constructor() {
    this.pointingTimerMap = new Map();

    this.onClickConnect = this.onClickConnect.bind(this);
    this.onClickAudioMuting = this.onClickAudioMuting.bind(this);
    this.onClickCameraMuting = this.onClickCameraMuting.bind(this);
    this.onClickCameraSwitching = this.onClickCameraSwitching.bind(this);
    this.onClickPresenterStream = this.onClickPresenterStream.bind(this);

    this.onData = this.onData.bind(this);
    this.onLeave = this.onLeave.bind(this);
    this.onStream = this.onStream.bind(this);

    this.init();
  }

  async init() {
    const url = new URL(document.URL);
    this.key = url.searchParams.get("key");
    this.roomId = url.searchParams.get("roomId");
    this.network = url.searchParams.get("network");
    this.content = url.searchParams.get("content");

    if (!this.key || !this.roomId || !this.network) {
      alert("No key, room id or network");
      return;
    }

    if (this.network !== "sfu" && this.network !== "mesh") {
      alert("network should be 'sfu' or 'mesh'");
      return;
    }

    if (!this.content) {
      alert("No content");
      return;
    }

    $("#room-label").textContent = this.roomId;
    $("#audio-muting").addEventListener("click", this.onClickAudioMuting);
    $("#camera-muting").addEventListener("click", this.onClickCameraMuting);
    $("#camera-switching").addEventListener("click", this.onClickCameraSwitching);
    $("#connect-button").addEventListener("click", this.onClickConnect);

    // Want to enable pointing in near future.
    //$("#presenter-stream").addEventListener("click", this.onClickPresenterStream);
    $("#presenter-stream").src = this.content;
  }

  async connect() {
    const peer = await this.connectPeer(this.key);
    const stream = await this.getNextVideoStream();
    const room = peer.joinRoom(this.roomId, {
      mode: this.network,
      stream: stream
    });

    await this.createAudienceUI(stream, peer.id, true);

    room.on("data", this.onData);
    room.on("stream", this.onStream);
    room.on("peerLeave", this.onLeave);

    this.peer = peer;
    this.room = room;
  }

  connectPeer(key) {
    return new Promise(r => {
      const peer = new Peer({ key: key });
      peer.on("open", () => r(peer));
    });
  }

  async createAudienceUI(stream, peerId, isLocal) {
    const li = document.createElement("li");
    li.classList.add("audience");
    li.id = this.getAudienceId(peerId);
    li.dataset.peerId = peerId;

    const video = document.createElement("video");
    video.classList.add("audience-stream");
    if (isLocal) {
      video.classList.add("local-stream");
    }
    video.muted = isLocal;
    video.srcObject = stream;
    video.playsInline = true;
    video.play();

    li.appendChild(video);
    $("#audiences").appendChild(li);
  }

  dispatchToRoom(data) {
    this.room.send(data);
    // As the data is not sent to local by room.send, we send it to local as well manually.
    this.onData({ src: this.peer.id, data: data });
  }

  getAudienceId(peerId) {
    return `audience-${ peerId }`;
  }

  getPointId(peerId) {
    return `point-${ peerId }`;
  }

  async getNextVideoStream() {
    const devices = await this.getVideoInputDevices();

    let nextDevice = null;
    if (!this.currentVideoDeviceId) {
      // Use first device.
      nextDevice = devices[0];
    } else {
      const index = devices.findIndex(device => device.deviceId === this.currentVideoDeviceId);
      nextDevice = index === devices.length - 1 ? devices[0] : devices[index + 1];
    }

    const deviceId = nextDevice.deviceId;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { deviceId: deviceId },
    });

    this.currentVideoDeviceId = deviceId;

    return stream;
  }

  async getVideoInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "videoinput");
  }

  async pointPresenterStream(peerId, x, y) {
    const presenterVideo = $("#presenter-stream");

    const pointId = this.getPointId(peerId);
    const presenter = $("#presenter");
    let point = presenter.querySelector(`#${ pointId }`);
    if (point) {
      point.remove();
    }

    point = document.createElement("mark");
    point.id = pointId;
    point.classList.add("pointing");

    const pointImage = document.createElement("img");
    pointImage.classList.add("pointing__image");
    pointImage.src = "images/pointing.png";
    point.append(pointImage);

    const pointX = presenterVideo.offsetLeft + presenterVideo.clientWidth * x;
    const pointY = presenterVideo.offsetTop + presenterVideo.clientHeight * y;
    const radian = Math.atan2(x - 0.5, -(y - 0.5));
    const angle = radian * 180 / Math.PI;
    point.style.left = `${ pointX }px`;
    point.style.top = `${ pointY }px`;
    point.style.transform = `translate(-60%, 0%) rotate(${angle}deg) scale(${angle > 0 ? -1 : 1}, 1)`;
    point.style.transformOrigin = "60% 0%";

    presenter.appendChild(point);

    clearTimeout(this.pointingTimerMap.get(peerId));
    const timerId = setTimeout(() => { point.remove() }, 4 * 1000);
    this.pointingTimerMap.set(peerId, timerId);
  }

  onClickAudioMuting({ target }) {
    target.classList.toggle("disabled");
    const video = $(".local-stream");
    const track = video.srcObject.getAudioTracks()[0];
    track.enabled = !target.classList.contains("disabled");
  }

  async onClickCameraSwitching() {
    const stream = await this.getNextVideoStream();

    // Request to replace remote stream.
    this.room.replaceStream(stream);

    const audienceVideo = $(".local-stream");
    audienceVideo.srcObject = stream;
    audienceVideo.play();
  }

  onClickCameraMuting({ target }) {
    target.classList.toggle("disabled");
    const video = $(".local-stream");
    const track = video.srcObject.getVideoTracks()[0];
    track.enabled = !target.classList.contains("disabled");
  }

  async onClickConnect() {
    $("#connect-button").disabled = true;

    try {
      await this.connect();
    } catch (e) {
      console.log(e);
    }

    $("#connect-form").remove();
  }

  async onClickPresenterStream({ target, layerX, layerY }) {
    const { clientWidth, clientHeight } = target;
    const x = layerX / clientWidth;
    const y = layerY / clientHeight;

    this.dispatchToRoom({
      command: "point-presenter-stream",
      peerId: this.peer.id,
      x: x,
      y: y
    });
  }

  async onData({ data }) {
    switch (data.command) {
      case "point-presenter-stream": {
        this.pointPresenterStream(data.peerId, data.x, data.y);
        break;
      }
    }
  }

  async onLeave(peerId) {
    $(`#${ this.getAudienceId(peerId) }`).remove();
  }

  async onStream(stream) {
    await this.createAudienceUI(stream, stream.peerId, false);
  }
}

function $(selector) {
  return document.querySelector(selector);
}

document.addEventListener("DOMContentLoaded", () => new App());
