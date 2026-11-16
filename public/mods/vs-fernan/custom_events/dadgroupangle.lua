local enable = false
			
function onEvent(name, value1, value2)
	if name == 'DadGroupAngle' then
		if value2 == 'True' or value2 == 'true' then
			enable = true
		elseif value2 == 'False' or value2 == 'false' then
			enable = false
			doTweenAngle('dadGroupAngle', 'dadGroup', 0, 0.25, 'SineInOut')
		end
		
		--doTweenAngle('dadGroupAngle', 'dadGroup', angleOfs, 0.1, 'Linear')
	end
	
	function onUpdate(Elapsed)
		local angleOfs = math.random(-value1, value1)
		
		if enable == true then
			setProperty('dadGroup.angle', angleOfs)
			-- doTweenAngle('dadGroupAngle', 'dadGroup', angleOfs, 0.1, 'Linear') // this is much smoother
		elseif enable == false then
			doTweenAngle('dadGroupAngle', 'dadGroup', 0, 0.25, 'SineInOut')
		end
	end
end