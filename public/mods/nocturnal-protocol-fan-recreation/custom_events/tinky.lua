local screamerX = 650
local screamerY = 350

function onEvent(name, value1, value2)

    if name == 'Tinky' and value1 == 'on' then

        makeLuaSprite('tinkiscreamer', 'tinky', screamerX, screamerY)

        setObjectCamera('tinkiscreamer', 'hud')

        scaleObject('tinkiscreamer', 0.01, 0.01)

        addLuaSprite('tinkiscreamer', true)

        doTweenX('screamerScaleX', 'tinkiscreamer.scale', 6, 0.6, 'quintIn')
        doTweenY('screamerScaleY', 'tinkiscreamer.scale', 6, 0.6, 'quintIn')
        
        runTimer('removeScreamer', 0.58)

    end

end

function onTweenCompleted(tag)

    if tag == 'screamerScaleY' then
        removeLuaSprite('tinkiscreamer', true)
    end

end