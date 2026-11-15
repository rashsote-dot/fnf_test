function onCreate()
    makeLuaSprite('tinkyscreamer', 'dropimages/image3', 120, 0)
    setObjectCamera('tinkyscreamer', 'hud')
    setProperty('tinkyscreamer.alpha', 0)
    addLuaSprite('tinkyscreamer', true)
    scaleObject('tinkyscreamer', 2.7, 2.7)
end

function onEvent(name, value1, value2)
    if name == 'TinkyScreamer' then
        if value1 == 'on' then
            setProperty('tinkyscreamer.alpha', 1)
            runTimer('hideTinky', 0.05)
        end
    end
end

function onTimerCompleted(tag)
    if tag == 'hideTinky' then
        setProperty('tinkyscreamer.alpha', 0)
    end
end