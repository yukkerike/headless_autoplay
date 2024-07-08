import {useState} from "react";

function Form(props) {
    const [state, setState] = useState(props.object);
    return (
        <div>
            {Object.keys(state).map((key) => {
                return (
                    <div className={"flex flex-col border m-3 " + (key === 'players' ? 'bg-amber-100' : '')} key={key}>
                        <label className="text-xl">{key}</label>
                        { key === 'players' ? (<div className="flex justify-between">
                            <button className="bg-green-300 rounded-full p-1" onClick={(e) => {
                                e.preventDefault()
                                setState({...state, [key]: [...state[key], {...props.object.defaults, session: 'ВАША СЕССИЯ'}]});
                                props.addNewPlayer()
                            }}>Добавить игрока</button>
                            <button className="bg-red-300 rounded-full p-1" onClick={(e) => {
                                e.preventDefault()
                                setState({...state, [key]: [...state[key], {...props.object.defaults, session: 'ВАША СЕССИЯ'}]});
                                props.removePlayer(props.object.players.length - 1)
                            }}>Удалить последнего игрока</button></div>): null }
                        {typeof state[key] === 'object' && state[key] !== null ? (
                            <div className="bg-gray-100"><Form object={state[key]}/></div>
                        ) : (
                            state[key] === true || state[key] === false ? (
                                <input
                                    className="border-2 border-black rounded-md w-5"
                                    type="checkbox"
                                    checked={state[key]}
                                    onChange={(e) => {
                                        setState({...state, [key]: e.target.checked});
                                        props.object[key] = e.target.checked;
                                    }}
                                />
                            ) : (
                            <input
                                className="border-2 border-black rounded-md"
                                type="text"
                                value={state[key]}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setState({...state, [key]: value});
                                    try {
                                        props.object[key] = JSON.parse(value);
                                    } catch (e) {
                                        props.object[key] = value ? value : null;
                                    }
                                }}
                            />
                            ))}
                    </div>
                );
            })}
        </div>
    );
}

export default Form;