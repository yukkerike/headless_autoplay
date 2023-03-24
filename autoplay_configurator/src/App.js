import './App.css';
import * as player from './player.js';
import Form from "./render_form";

function App() {
  return (
    <div className="App">
        <div className="flex justify-between bg-gray-200 items-center">
            <h1>Конфигуратор headless_autoplay</h1>
            <button
                className="bg-blue-300 rounded-full p-1"
                onClick={() => {
                const config = player.getConfig();
                // download config as file config.yaml
                const element = document.createElement("a");
                const file = new Blob([config], {type: 'text/plain'});
                element.href = URL.createObjectURL(file);
                element.download = "config.yaml";
                document.body.appendChild(element); // Required for this to work in FireFox
                element.click();
                element.remove();
            }
            }>Сохранить</button>
        </div>
        <form>
            <Form object={player.config} addNewPlayer={player.addNewPlayer} removePlayer={player.removePlayer}/>
        </form>

    </div>

  );
}
window.player = player;
export default App;
